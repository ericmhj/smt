import { jwtVerify, importSPKI, type KeyLike } from 'jose';
import type { AuthStrategy } from './auth-strategy.factory.js';
import type { JWTPayload } from './auth.types.js';
import { AuthErrorCode } from './auth.types.js';
import type { AppConfig } from '../../lib/config.js';
import { getRedisClient, tenantKey } from '../../lib/redis.js';

export class StandaloneAuthStrategy implements AuthStrategy {
  private publicKey: KeyLike | null = null;
  private config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    this.publicKey = await importSPKI(this.config.jwt.publicKey, 'RS256');
  }

  async verifyToken(token: string): Promise<JWTPayload> {
    if (!this.publicKey) {
      await this.initialize();
    }

    try {
      const { payload } = await jwtVerify(token, this.publicKey!, {
        issuer: this.config.jwt.issuer,
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
      const redis = getRedisClient();
      const blacklistKey = tenantKey(jwtPayload.tenantSlug, 'blacklist', jwtPayload.jti);
      const isBlacklisted = await redis.exists(blacklistKey);

      if (isBlacklisted) {
        throw { statusCode: 401, code: AuthErrorCode.SESSION_REVOKED, message: 'Token revocado' };
      }

      return jwtPayload;
    } catch (error: any) {
      if (error?.statusCode) throw error;
      if (error?.message?.includes('expired')) {
        throw { statusCode: 401, code: AuthErrorCode.TOKEN_EXPIRED, message: 'Token expirado' };
      }
      throw { statusCode: 401, code: AuthErrorCode.TOKEN_INVALID, message: 'Token inválido' };
    }
  }

  isLoginEnabled(): boolean {
    return true;
  }
}
