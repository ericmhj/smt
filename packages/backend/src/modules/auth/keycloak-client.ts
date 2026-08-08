import { AuthError } from './auth.service.js';

/**
 * Error codes specific to the Keycloak integration cascade.
 */
export const KeycloakErrorCode = {
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_SERVICE_UNAVAILABLE: 'AUTH_SERVICE_UNAVAILABLE',
} as const;

export interface KeycloakClientConfig {
  tokenUrl: string;   // KEYCLOAK_TOKEN_URL
  clientId: string;   // KEYCLOAK_CLIENT_ID
  clientSecret: string; // KEYCLOAK_CLIENT_SECRET
}

export interface KeycloakTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export interface KeycloakClaims {
  sub: string;
  roles: string[];
  name?: string;
  email?: string;
  tenantId?: string;
}

/**
 * Client for authenticating users against Keycloak using the
 * Direct Access Grant (Resource Owner Password Credentials) flow.
 */
export class KeycloakClient {
  private config: KeycloakClientConfig;

  constructor(config: KeycloakClientConfig) {
    this.config = config;
  }

  /**
   * Authenticates a user against Keycloak using the Direct Access Grant.
   * Sends a POST to the Keycloak token endpoint with grant_type=password.
   *
   * @throws AuthError with AUTH_INVALID_CREDENTIALS (401) if credentials are wrong
   * @throws AuthError with AUTH_SERVICE_UNAVAILABLE (503) if Keycloak is unreachable or returns 5xx
   */
  async authenticateUser(email: string, password: string): Promise<KeycloakTokenResponse> {
    const body = new URLSearchParams({
      grant_type: 'password',
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      username: email,
      password,
    });

    let response: Response;

    try {
      response = await fetch(this.config.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error: unknown) {
      // Network errors, timeouts, DNS failures
      throw new AuthError(
        503,
        KeycloakErrorCode.AUTH_SERVICE_UNAVAILABLE,
        'Servicio de autenticación no disponible',
      );
    }

    if (response.status === 401 || response.status === 400) {
      // Keycloak returns 400 for invalid_grant (wrong credentials)
      // and 401 for unauthorized client — both mean invalid credentials from user's perspective
      throw new AuthError(
        401,
        KeycloakErrorCode.AUTH_INVALID_CREDENTIALS,
        'Credenciales inválidas',
      );
    }

    if (response.status >= 500) {
      throw new AuthError(
        503,
        KeycloakErrorCode.AUTH_SERVICE_UNAVAILABLE,
        'Servicio de autenticación no disponible',
      );
    }

    if (!response.ok) {
      // Any other unexpected status
      throw new AuthError(
        503,
        KeycloakErrorCode.AUTH_SERVICE_UNAVAILABLE,
        'Servicio de autenticación no disponible',
      );
    }

    const data = (await response.json()) as KeycloakTokenResponse;
    return data;
  }

  /**
   * Refreshes an access token using a Keycloak refresh_token.
   *
   * @throws AuthError with AUTH_INVALID_CREDENTIALS (401) if refresh token is invalid/expired
   * @throws AuthError with AUTH_SERVICE_UNAVAILABLE (503) if Keycloak is unreachable
   */
  async refreshToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      refresh_token: refreshToken,
    });

    let response: Response;

    try {
      response = await fetch(this.config.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new AuthError(
        503,
        KeycloakErrorCode.AUTH_SERVICE_UNAVAILABLE,
        'Servicio de autenticación no disponible',
      );
    }

    if (response.status === 400 || response.status === 401) {
      throw new AuthError(401, 'AUTH_REFRESH_INVALID', 'Sesión expirada, inicie sesión nuevamente');
    }

    if (!response.ok) {
      throw new AuthError(
        503,
        KeycloakErrorCode.AUTH_SERVICE_UNAVAILABLE,
        'Servicio de autenticación no disponible',
      );
    }

    const data = (await response.json()) as KeycloakTokenResponse;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
    };
  }

  /**
   * Decodes a JWT access token payload (without cryptographic verification)
   * and extracts the standard Keycloak claims.
   *
   * Note: Cryptographic verification is handled separately by the KeycloakAuthStrategy
   * using JWKS. This method only extracts claims for building the login response.
   */
  extractClaims(accessToken: string): KeycloakClaims {
    const parts = accessToken.split('.');
    if (parts.length !== 3) {
      throw new AuthError(401, KeycloakErrorCode.AUTH_INVALID_CREDENTIALS, 'Token inválido');
    }

    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf-8'));

    // Extract roles from various possible Keycloak claim locations
    let roles: string[] = [];

    if (Array.isArray(payload.roles)) {
      roles = payload.roles;
    } else if (payload.realm_access?.roles && Array.isArray(payload.realm_access.roles)) {
      roles = payload.realm_access.roles;
    } else if (payload.resource_access) {
      // Collect roles from all resource_access clients
      for (const client of Object.values(payload.resource_access) as Array<{ roles?: string[] }>) {
        if (client?.roles && Array.isArray(client.roles)) {
          roles = roles.concat(client.roles);
        }
      }
    }

    // Filter out Keycloak internal roles, keep only application roles
    const APP_ROLES = ['platform_admin', 'superusuario', 'admin', 'manager', 'tecnico', 'asistente'];
    const appRoles = roles.filter((r) => APP_ROLES.includes(r));

    return {
      sub: payload.sub || '',
      roles: appRoles.length > 0 ? appRoles : roles,
      name: payload.name || payload.preferred_username || undefined,
      email: payload.email || undefined,
      tenantId: payload.tenant_id || payload.tenantId || undefined,
    };
  }
}
