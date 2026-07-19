import type { AppConfig } from '../../lib/config.js';
import type { JWTPayload, LoginDTO } from './auth.types.js';
import type { CascadeLoginResult } from './integrated-auth.strategy.js';

/**
 * Strategy interface for authentication.
 * Implementations: StandaloneAuthStrategy (local JWT) and IntegratedAuthStrategy (Keycloak cascade)
 */
export interface AuthStrategy {
  /**
   * Verify a JWT token and return the decoded payload.
   * @throws Error with statusCode, code, and message on failure
   */
  verifyToken(token: string): Promise<JWTPayload>;

  /**
   * Whether the local login/refresh endpoints are enabled.
   * Returns true for standalone mode and integrated mode (cascade login).
   */
  isLoginEnabled(): boolean;

  /**
   * Perform login via the strategy's mechanism.
   * In integrated mode, orchestrates the Keycloak → License → Tenant cascade.
   * Optional — only implemented by strategies that support login.
   */
  login?(credentials: LoginDTO, tenantSlug: string): Promise<CascadeLoginResult>;

  /**
   * Refresh an access token using a refresh token.
   * In integrated mode, delegates to Keycloak's token endpoint.
   * Optional — only implemented by strategies that support refresh.
   */
  refreshToken?(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }>;
}

/**
 * Factory function that creates the appropriate auth strategy based on config.
 * - STANDALONE_AUTH=true → StandaloneAuthStrategy (local RS256 JWT)
 * - STANDALONE_AUTH=false → IntegratedAuthStrategy (Keycloak cascade)
 */
export async function createAuthStrategy(config: AppConfig): Promise<AuthStrategy> {
  if (config.standaloneAuth) {
    const { StandaloneAuthStrategy } = await import('./standalone-auth.strategy.js');
    return new StandaloneAuthStrategy(config);
  } else {
    // Validate required Keycloak environment variables for integrated mode
    const keycloakTokenUrl = config.keycloak?.tokenUrl;
    const keycloakClientId = config.keycloak?.clientId;
    const keycloakClientSecret = config.keycloak?.clientSecret;

    const missingVars: string[] = [];
    if (!keycloakTokenUrl) missingVars.push('KEYCLOAK_TOKEN_URL');
    if (!keycloakClientId) missingVars.push('KEYCLOAK_CLIENT_ID');
    if (!keycloakClientSecret) missingVars.push('KEYCLOAK_CLIENT_SECRET');

    if (missingVars.length > 0) {
      const message = `Variables de entorno requeridas en modo integrado no configuradas: ${missingVars.join(', ')}`;
      console.error(message);
      throw new Error(message);
    }

    const { IntegratedAuthStrategy } = await import('./integrated-auth.strategy.js');
    return new IntegratedAuthStrategy({
      keycloakTokenUrl: keycloakTokenUrl!,
      keycloakClientId: keycloakClientId!,
      keycloakClientSecret: keycloakClientSecret!,
      keycloakJwksUrl: config.keycloak!.jwksUrl,
      keycloakIssuer: config.keycloak!.issuer,
      keycloakJwksCacheTtl: config.keycloak!.jwksCacheTtl,
      licenseServiceBaseUrl: config.licenseService!.baseUrl,
      licenseServiceTimeoutMs: config.licenseService!.timeoutMs,
      licenseServiceCircuitBreaker: config.licenseService!.circuitBreaker,
    });
  }
}
