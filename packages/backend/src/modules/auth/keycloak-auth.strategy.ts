import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { AuthStrategy } from './auth-strategy.factory.js';
import type { JWTPayload } from './auth.types.js';

interface KeycloakConfig {
  jwksUrl: string;
  issuer: string;
  jwksCacheTtl: number;
}

export class KeycloakAuthStrategy implements AuthStrategy {
  private jwks: ReturnType<typeof createRemoteJWKSet>;
  private issuer: string;

  constructor(config: KeycloakConfig) {
    this.jwks = createRemoteJWKSet(new URL(config.jwksUrl), {
      cacheMaxAge: config.jwksCacheTtl * 1000, // Convert seconds to ms
    });
    this.issuer = config.issuer;
  }

  async verifyToken(token: string): Promise<JWTPayload> {
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
      });

      // Extract roles - Keycloak may put them in different places
      const roles: string[] =
        (payload.roles as string[]) ||
        (payload.realm_access as { roles: string[] })?.roles ||
        [];

      const role = roles[0] || 'tecnico'; // Default role if none found

      return {
        sub: payload.sub as string,
        role,
        tenantId: (payload.tenant_id as string) || '',
        tenantSlug: '', // Will be resolved by tenant middleware from X-Tenant-Slug header or DB lookup
        iat: payload.iat as number,
        exp: payload.exp as number,
        jti: payload.jti as string,
      };
    } catch (error: any) {
      if (error?.code === 'ERR_JWT_EXPIRED') {
        throw { statusCode: 401, code: 'AUTH_002', message: 'Token expirado' };
      }
      if (error?.code === 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED') {
        throw { statusCode: 401, code: 'AUTH_INVALID_TOKEN', message: 'Firma de token inválida' };
      }
      throw { statusCode: 401, code: 'AUTH_INVALID_TOKEN', message: 'Token inválido' };
    }
  }

  isLoginEnabled(): boolean {
    return false;
  }
}
