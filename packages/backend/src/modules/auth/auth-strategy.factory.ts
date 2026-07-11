import type { AppConfig } from '../../lib/config.js';
import type { JWTPayload } from './auth.types.js';

/**
 * Strategy interface for authentication.
 * Implementations: StandaloneAuthStrategy (local JWT) and KeycloakAuthStrategy (JWKS)
 */
export interface AuthStrategy {
  /**
   * Verify a JWT token and return the decoded payload.
   * @throws Error with statusCode, code, and message on failure
   */
  verifyToken(token: string): Promise<JWTPayload>;

  /**
   * Whether the local login/refresh endpoints are enabled.
   * Returns true for standalone mode, false for integrated (Keycloak) mode.
   */
  isLoginEnabled(): boolean;
}

/**
 * Factory function that creates the appropriate auth strategy based on config.
 * - STANDALONE_AUTH=true → StandaloneAuthStrategy (local RS256 JWT)
 * - STANDALONE_AUTH=false → KeycloakAuthStrategy (remote JWKS)
 */
export async function createAuthStrategy(config: AppConfig): Promise<AuthStrategy> {
  if (config.standaloneAuth) {
    const { StandaloneAuthStrategy } = await import('./standalone-auth.strategy.js');
    return new StandaloneAuthStrategy(config);
  } else {
    const { KeycloakAuthStrategy } = await import('./keycloak-auth.strategy.js');
    return new KeycloakAuthStrategy(config.keycloak!);
  }
}
