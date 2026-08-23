import { SignJWT, jwtVerify, importPKCS8, importSPKI, type KeyLike } from 'jose';
import bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type Redis from 'ioredis';
import type { Database } from '../../db/index.js';
import { users } from '../../db/schema/users.js';
import { tenants } from '../../db/schema/platform.js';
import { getRedisClient, tenantKey } from '../../lib/redis.js';
import { getSqlClient } from '../../db/index.js';
import { toSchemaName } from '../../lib/tenant-schema.js';
import type { TokenPair, LoginResponse, JWTPayload, LoginDTO } from './auth.types.js';
import { AuthErrorCode } from './auth.types.js';

export class AuthError extends Error {
  constructor(
    public statusCode: number,
    public code: AuthErrorCode | string,
    message: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

interface AuthServiceConfig {
  privateKey: string;
  publicKey: string;
  accessTokenExpiry: string;
  refreshTokenExpiry: string;
  issuer: string;
}

export class AuthService {
  private privateKey: KeyLike | null = null;
  private publicKey: KeyLike | null = null;
  private redis: Redis;
  private config: AuthServiceConfig;
  private db: Database;

  constructor(db: Database, config: AuthServiceConfig) {
    this.db = db;
    this.config = config;
    this.redis = getRedisClient();
  }

  async initialize(): Promise<void> {
    this.privateKey = await importPKCS8(this.config.privateKey, 'RS256');
    this.publicKey = await importSPKI(this.config.publicKey, 'RS256');
  }

  /**
   * Resolves the tenant slug from the request Host header.
   * Falls back to 'default' for localhost/IP/bare domain.
   */
  private resolveTenantSlugFromHost(host: string | undefined): string {
    if (!host) return 'default';

    // If it looks like a plain slug (no dots, no port), use directly
    if (!host.includes('.') && !host.includes(':')) {
      return host;
    }

    const hostWithoutPort = host.split(':')[0]!;

    if (
      hostWithoutPort === 'localhost' ||
      hostWithoutPort === '127.0.0.1' ||
      /^\d+\.\d+\.\d+\.\d+$/.test(hostWithoutPort)
    ) {
      return 'default';
    }

    const parts = hostWithoutPort.split('.');

    // Handle X.localhost pattern (e.g., "acme.localhost")
    if (parts.length === 2 && parts[1] === 'localhost') {
      return parts[0]!;
    }

    // Handle X.domain.tld pattern (e.g., "acme.sgr.com")
    if (parts.length >= 3) {
      return parts[0]!;
    }

    return 'default';
  }

  async login(credentials: LoginDTO, host?: string): Promise<LoginResponse> {
    const { email, password } = credentials;

    // Resolve tenant from host subdomain
    const tenantSlug = this.resolveTenantSlugFromHost(host);

    // Look up tenant
    const tenantResult = await this.db
      .select({ id: tenants.id, status: tenants.status })
      .from(tenants)
      .where(eq(tenants.slug, tenantSlug))
      .limit(1);

    const tenant = tenantResult[0];

    if (!tenant) {
      throw new AuthError(404, 'TENANT_NOT_FOUND', `Tenant '${tenantSlug}' no encontrado`);
    }

    if (tenant.status !== 'active') {
      throw new AuthError(403, 'TENANT_SUSPENDED', 'El tenant se encuentra suspendido');
    }

    // Use a single connection to ensure search_path applies to the user query
    const sql = getSqlClient();
    const schemaName = toSchemaName(tenantSlug);
    const userRows = await sql.unsafe(
      `SELECT id, email, password_hash, name, role, is_active
       FROM ${schemaName}.users
       WHERE email = $1
       LIMIT 1`,
      [email]
    );

    const user = userRows[0];

    if (!user) {
      throw new AuthError(401, AuthErrorCode.INVALID_CREDENTIALS, 'Credenciales inválidas');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      throw new AuthError(401, AuthErrorCode.INVALID_CREDENTIALS, 'Credenciales inválidas');
    }

    // Check if user is active
    if (!user.is_active) {
      throw new AuthError(401, AuthErrorCode.SESSION_REVOKED, 'Usuario desactivado');
    }

    // Generate token pair with tenant claims
    const tokenPair = await this.generateTokenPair(user.id, user.role, tenant.id, tenantSlug);

    return {
      ...tokenPair,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        tenantId: tenant.id,
        tenantSlug,
      },
    };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    // Verify refresh token signature
    const payload = await this.verifyRefreshToken(refreshToken);

    // Check if refresh token exists in Redis (not revoked)
    const redisKey = tenantKey(payload.tenantSlug, 'refresh', payload.sub, payload.jti);
    const exists = await this.redis.exists(redisKey);

    if (!exists) {
      throw new AuthError(401, AuthErrorCode.SESSION_REVOKED, 'Token de refresco revocado');
    }

    // Delete old refresh token (rotation)
    await this.redis.del(redisKey);

    // Generate new token pair carrying forward tenant claims
    return this.generateTokenPair(payload.sub, payload.role, payload.tenantId, payload.tenantSlug);
  }

  async logout(userId: string, accessTokenJti?: string, tenantSlug?: string): Promise<void> {
    const slug = tenantSlug || 'default';

    // Delete all refresh tokens for user (tenant-scoped)
    const pattern = tenantKey(slug, 'refresh', userId, '*');
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }

    // Add current access token to blacklist if provided
    if (accessTokenJti) {
      const blacklistKey = tenantKey(slug, 'blacklist', accessTokenJti);
      const ttlSeconds = 15 * 60; // 15 minutes max
      await this.redis.set(blacklistKey, '1', 'EX', ttlSeconds);
    }
  }

  async verifyToken(token: string): Promise<JWTPayload> {
    if (!this.publicKey) {
      throw new AuthError(500, AuthErrorCode.TOKEN_INVALID, 'Servicio de autenticación no inicializado');
    }

    try {
      const { payload } = await jwtVerify(token, this.publicKey, {
        issuer: this.config.issuer,
      });

      const jwtPayload: JWTPayload = {
        sub: payload.sub as string,
        role: payload.role as string,
        tenantId: (payload.tenantId as string) || '00000000-0000-0000-0000-000000000001',
        tenantSlug: (payload.tenantSlug as string) || 'default',
        iat: payload.iat as number,
        exp: payload.exp as number,
        jti: payload.jti as string,
      };

      // Check if token is blacklisted (tenant-scoped)
      const blacklistKey = tenantKey(jwtPayload.tenantSlug, 'blacklist', jwtPayload.jti);
      const isBlacklisted = await this.redis.exists(blacklistKey);

      if (isBlacklisted) {
        throw new AuthError(401, AuthErrorCode.SESSION_REVOKED, 'Token revocado');
      }

      return jwtPayload;
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      if (error instanceof Error && error.message.includes('expired')) {
        throw new AuthError(401, AuthErrorCode.TOKEN_EXPIRED, 'Token expirado');
      }
      throw new AuthError(401, AuthErrorCode.TOKEN_INVALID, 'Token inválido');
    }
  }

  private async generateTokenPair(
    userId: string,
    role: string,
    tenantId: string,
    tenantSlug: string,
  ): Promise<TokenPair> {
    if (!this.privateKey) {
      throw new AuthError(500, AuthErrorCode.TOKEN_INVALID, 'Servicio de autenticación no inicializado');
    }

    // Técnico role gets shorter-lived tokens aligned to session countdown (7 min)
    const accessExpiry = role === 'tecnico' ? '7m' : this.config.accessTokenExpiry;
    const refreshExpiry = role === 'tecnico' ? '8m' : this.config.refreshTokenExpiry;

    const accessTokenJti = randomUUID();
    const refreshTokenJti = randomUUID();

    // Generate access token
    const accessToken = await new SignJWT({ role, tenantId, tenantSlug })
      .setProtectedHeader({ alg: 'RS256' })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime(accessExpiry)
      .setIssuer(this.config.issuer)
      .setJti(accessTokenJti)
      .sign(this.privateKey);

    // Generate refresh token
    const refreshToken = await new SignJWT({ role, tenantId, tenantSlug })
      .setProtectedHeader({ alg: 'RS256' })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime(refreshExpiry)
      .setIssuer(this.config.issuer)
      .setJti(refreshTokenJti)
      .sign(this.privateKey);

    // Store refresh token in Redis with TTL (tenant-namespaced)
    const refreshTtlSeconds = this.parseExpiryToSeconds(refreshExpiry);
    const redisKey = tenantKey(tenantSlug, 'refresh', userId, refreshTokenJti);
    await this.redis.set(redisKey, '1', 'EX', refreshTtlSeconds);

    return { accessToken, refreshToken };
  }

  private async verifyRefreshToken(token: string): Promise<JWTPayload> {
    if (!this.publicKey) {
      throw new AuthError(500, AuthErrorCode.TOKEN_INVALID, 'Servicio de autenticación no inicializado');
    }

    try {
      const { payload } = await jwtVerify(token, this.publicKey, {
        issuer: this.config.issuer,
      });

      return {
        sub: payload.sub as string,
        role: payload.role as string,
        tenantId: (payload.tenantId as string) || '00000000-0000-0000-0000-000000000001',
        tenantSlug: (payload.tenantSlug as string) || 'default',
        iat: payload.iat as number,
        exp: payload.exp as number,
        jti: payload.jti as string,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('expired')) {
        throw new AuthError(401, AuthErrorCode.TOKEN_EXPIRED, 'Token de refresco expirado');
      }
      throw new AuthError(401, AuthErrorCode.TOKEN_INVALID, 'Token de refresco inválido');
    }
  }

  private parseExpiryToSeconds(expiry: string): number {
    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) {
      return 7 * 24 * 60 * 60; // Default 7 days
    }

    const value = parseInt(match[1]!, 10);
    const unit = match[2]!;

    switch (unit) {
      case 's': return value;
      case 'm': return value * 60;
      case 'h': return value * 60 * 60;
      case 'd': return value * 24 * 60 * 60;
      default: return 7 * 24 * 60 * 60;
    }
  }
}
