import { SignJWT, jwtVerify, importPKCS8, importSPKI, type KeyLike } from 'jose';
import bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type Redis from 'ioredis';
import type { Database } from '../../db/index.js';
import { users } from '../../db/schema/users.js';
import { getRedisClient } from '../../lib/redis.js';
import type { TokenPair, JWTPayload, LoginDTO } from './auth.types.js';
import { AuthErrorCode } from './auth.types.js';

export class AuthError extends Error {
  constructor(
    public statusCode: number,
    public code: AuthErrorCode,
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

  async login(credentials: LoginDTO): Promise<TokenPair> {
    const { email, password } = credentials;

    // Find user by email
    const result = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    const user = result[0];

    if (!user) {
      throw new AuthError(401, AuthErrorCode.INVALID_CREDENTIALS, 'Credenciales inválidas');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new AuthError(401, AuthErrorCode.INVALID_CREDENTIALS, 'Credenciales inválidas');
    }

    // Check if user is active
    if (!user.isActive) {
      throw new AuthError(401, AuthErrorCode.SESSION_REVOKED, 'Usuario desactivado');
    }

    // Generate token pair
    return this.generateTokenPair(user.id, user.role);
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    // Verify refresh token signature
    const payload = await this.verifyRefreshToken(refreshToken);

    // Check if refresh token exists in Redis (not revoked)
    const redisKey = `refresh:${payload.sub}:${payload.jti}`;
    const exists = await this.redis.exists(redisKey);

    if (!exists) {
      throw new AuthError(401, AuthErrorCode.SESSION_REVOKED, 'Token de refresco revocado');
    }

    // Delete old refresh token (rotation)
    await this.redis.del(redisKey);

    // Generate new token pair
    return this.generateTokenPair(payload.sub, payload.role);
  }

  async logout(userId: string, accessTokenJti?: string): Promise<void> {
    // Delete all refresh tokens for user
    const pattern = `refresh:${userId}:*`;
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }

    // Add current access token to blacklist if provided
    if (accessTokenJti) {
      // Blacklist for remaining TTL (max 15 minutes)
      const blacklistKey = `blacklist:${accessTokenJti}`;
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
        iat: payload.iat as number,
        exp: payload.exp as number,
        jti: payload.jti as string,
      };

      // Check if token is blacklisted
      const blacklistKey = `blacklist:${jwtPayload.jti}`;
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

  private async generateTokenPair(userId: string, role: string): Promise<TokenPair> {
    if (!this.privateKey) {
      throw new AuthError(500, AuthErrorCode.TOKEN_INVALID, 'Servicio de autenticación no inicializado');
    }

    const accessTokenJti = randomUUID();
    const refreshTokenJti = randomUUID();

    // Generate access token
    const accessToken = await new SignJWT({ role })
      .setProtectedHeader({ alg: 'RS256' })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime(this.config.accessTokenExpiry)
      .setIssuer(this.config.issuer)
      .setJti(accessTokenJti)
      .sign(this.privateKey);

    // Generate refresh token
    const refreshToken = await new SignJWT({ role })
      .setProtectedHeader({ alg: 'RS256' })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime(this.config.refreshTokenExpiry)
      .setIssuer(this.config.issuer)
      .setJti(refreshTokenJti)
      .sign(this.privateKey);

    // Store refresh token in Redis with TTL
    const refreshTtlSeconds = this.parseExpiryToSeconds(this.config.refreshTokenExpiry);
    const redisKey = `refresh:${userId}:${refreshTokenJti}`;
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
