/**
 * Keycloak Admin Client for user provisioning.
 * Used during tenant provisioning to create users in Keycloak
 * so they can log in via the integrated authentication flow.
 */

export interface KeycloakAdminConfig {
  baseUrl: string;
  realm: string;
  adminRealm: string;
  adminUser: string;
  adminPassword: string;
}

export interface CreateUserOptions {
  email: string;
  password: string;
  temporary: boolean;
  tenantSlug: string;
  role: string;
  firstName?: string;
  lastName?: string;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
}

export class KeycloakAdminClient {
  private config: KeycloakAdminConfig;
  private cachedToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(config: KeycloakAdminConfig) {
    this.config = config;
  }

  /**
   * Authenticates against the admin realm and returns a cached token.
   * Re-fetches when token is expired or about to expire (30s buffer).
   */
  async getAdminToken(): Promise<string> {
    const now = Date.now();

    // Return cached token if still valid (with 30s buffer)
    if (this.cachedToken && now < this.tokenExpiresAt - 30_000) {
      return this.cachedToken;
    }

    const tokenUrl = `${this.config.baseUrl}/realms/${this.config.adminRealm}/protocol/openid-connect/token`;

    const body = new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: this.config.adminUser,
      password: this.config.adminPassword,
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`[KeycloakAdmin] Error obteniendo token admin: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as TokenResponse;
    this.cachedToken = data.access_token;
    this.tokenExpiresAt = now + data.expires_in * 1000;

    return this.cachedToken;
  }

  /**
   * Creates a user in Keycloak and assigns the specified realm role.
   * Handles 409 Conflict (user already exists) gracefully.
   * Non-blocking: logs errors but does not throw.
   */
  async createUser(options: CreateUserOptions): Promise<void> {
    const { email, password, temporary, tenantSlug, role, firstName, lastName } = options;

    try {
      console.log(`[KeycloakAdmin] createUser() llamado para '${email}' (tenant: ${tenantSlug}, rol: ${role})`);
      console.log(`[KeycloakAdmin] Obteniendo admin token de ${this.config.baseUrl}/realms/${this.config.adminRealm}...`);
      const token = await this.getAdminToken();
      console.log(`[KeycloakAdmin] Token admin obtenido exitosamente (${token.substring(0, 20)}...)`);

      // 1. Create the user
      const createUserUrl = `${this.config.baseUrl}/admin/realms/${this.config.realm}/users`;
      console.log(`[KeycloakAdmin] POST ${createUserUrl}`);

      const userPayload = {
        username: email,
        email,
        enabled: true,
        emailVerified: true,
        firstName: firstName || 'Admin',
        lastName: lastName || tenantSlug,
        credentials: [
          {
            type: 'password',
            value: password,
            temporary,
          },
        ],
        attributes: {
          tenant_slug: [tenantSlug],
          user_role: [role],
        },
      };

      const createResponse = await fetch(createUserUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(userPayload),
      });

      console.log(`[KeycloakAdmin] Response status: ${createResponse.status}`);

      if (createResponse.status === 409) {
        console.log(`[KeycloakAdmin] Usuario '${email}' ya existe en Keycloak, omitiendo creación`);
        return;
      }

      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        console.error(`[KeycloakAdmin] Error creando usuario '${email}': ${createResponse.status} - ${errorText}`);
        return;
      }

      console.log(`[KeycloakAdmin] Usuario '${email}' creado exitosamente (status 201)`);

      // 2. Get the user ID from the Location header
      const locationHeader = createResponse.headers.get('Location');
      let userId: string | null = null;

      if (locationHeader) {
        userId = locationHeader.split('/').pop() || null;
        console.log(`[KeycloakAdmin] User ID extraído del Location header: ${userId}`);
      }

      if (!userId) {
        console.log(`[KeycloakAdmin] Buscando user ID por email...`);
        userId = await this.getUserIdByEmail(email, token);
      }

      if (!userId) {
        console.error(`[KeycloakAdmin] No se pudo obtener ID del usuario '${email}' después de crearlo`);
        return;
      }

      // 3. Assign the realm role
      console.log(`[KeycloakAdmin] Asignando rol '${role}' al usuario ${userId}...`);
      await this.assignRealmRole(userId, role, token);

      console.log(`[KeycloakAdmin] ✓ Proceso completo: '${email}' creado con rol '${role}' en tenant '${tenantSlug}'`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      console.error(`[KeycloakAdmin] Error no-bloqueante creando usuario '${email}': ${errorMessage}`);
    }
  }

  /**
   * Search for a user by email and return their Keycloak ID.
   */
  private async getUserIdByEmail(email: string, token: string): Promise<string | null> {
    const searchUrl = `${this.config.baseUrl}/admin/realms/${this.config.realm}/users?email=${encodeURIComponent(email)}&exact=true`;

    const response = await fetch(searchUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      return null;
    }

    const users = (await response.json()) as Array<{ id: string }>;
    return users.length > 0 ? users[0].id : null;
  }

  /**
   * Assigns a realm role to a user.
   */
  private async assignRealmRole(userId: string, roleName: string, token: string): Promise<void> {
    // 1. Get the role representation
    const roleUrl = `${this.config.baseUrl}/admin/realms/${this.config.realm}/roles/${encodeURIComponent(roleName)}`;

    const roleResponse = await fetch(roleUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!roleResponse.ok) {
      console.warn(`[KeycloakAdmin] Rol '${roleName}' no encontrado en Keycloak, omitiendo asignación de rol`);
      return;
    }

    const roleRepresentation = await roleResponse.json();

    // 2. Assign the role to the user
    const assignUrl = `${this.config.baseUrl}/admin/realms/${this.config.realm}/users/${userId}/role-mappings/realm`;

    const assignResponse = await fetch(assignUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify([roleRepresentation]),
    });

    if (!assignResponse.ok) {
      const errorText = await assignResponse.text();
      console.warn(`[KeycloakAdmin] Error asignando rol '${roleName}' al usuario ${userId}: ${assignResponse.status} - ${errorText}`);
    }
  }
}
