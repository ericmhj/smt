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

export interface KeycloakUserRepresentation {
  id: string;
  username: string;
  email: string;
  enabled: boolean;
  emailVerified: boolean;
  firstName?: string;
  lastName?: string;
  createdTimestamp?: number;
  attributes?: Record<string, string[]>;
  realmRoles?: string[];
}

export interface FindUsersOptions {
  tenantSlug: string;
  search?: string;
  role?: string;
  enabled?: boolean;
  first?: number;
  max?: number;
}

export interface UpdateUserOptions {
  userId: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  enabled?: boolean;
  attributes?: Record<string, string[]>;
}

export interface ResetPasswordOptions {
  userId: string;
  password: string;
  temporary: boolean;
}

export interface CreateUserOptions {
  email: string;
  password: string;
  temporary: boolean;
  tenantSlug: string;
  roles: string[];
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
   * Returns the Keycloak UUID of the created (or existing) user, or null on failure.
   */
  async createUser(options: CreateUserOptions): Promise<string | null> {
    const { email, password, temporary, tenantSlug, roles, firstName, lastName } = options;

    try {
      console.log(`[KeycloakAdmin] createUser() llamado para '${email}' (tenant: ${tenantSlug}, roles: ${roles.join(', ')})`);
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
          user_roles: roles,
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
        // Still return the existing user's ID
        const token2 = await this.getAdminToken();
        return await this.getUserIdByEmail(email, token2);
      }

      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        console.error(`[KeycloakAdmin] Error creando usuario '${email}': ${createResponse.status} - ${errorText}`);
        return null;
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
        return null;
      }

      // 3. Assign the realm roles
      for (const role of roles) {
        console.log(`[KeycloakAdmin] Asignando rol '${role}' al usuario ${userId}...`);
        await this.assignRealmRole(userId, role, token);
      }

      console.log(`[KeycloakAdmin] ✓ Proceso completo: '${email}' creado con roles '${roles.join(', ')}' en tenant '${tenantSlug}'`);
      return userId;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      console.error(`[KeycloakAdmin] Error no-bloqueante creando usuario '${email}': ${errorMessage}`);
      return null;
    }
  }

  /**
   * Resets a user's password in Keycloak.
   * Throws on Keycloak failure.
   */
  async resetPassword(options: ResetPasswordOptions): Promise<void> {
    const token = await this.getAdminToken();

    const url = `${this.config.baseUrl}/admin/realms/${this.config.realm}/users/${options.userId}/reset-password`;

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        type: 'password',
        value: options.password,
        temporary: options.temporary,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `[KeycloakAdmin] Error resetting password for user ${options.userId}: ${response.status} - ${errorText}`,
      );
    }
  }

  /**
   * Search for a user by email and return their Keycloak ID.
   */
  async getUserIdByEmail(email: string, token?: string): Promise<string | null> {
    const t = token ?? await this.getAdminToken();
    const searchUrl = `${this.config.baseUrl}/admin/realms/${this.config.realm}/users?email=${encodeURIComponent(email)}&exact=true`;

    const response = await fetch(searchUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${t}` },
    });

    if (!response.ok) {
      return null;
    }

    const users = (await response.json()) as Array<{ id: string }>;
    return users.length > 0 ? users[0].id : null;
  }

  /**
   * Gets a single user by Keycloak ID.
   * Throws on Keycloak failure or 404.
   */
  async findUserById(userId: string): Promise<KeycloakUserRepresentation> {
    const token = await this.getAdminToken();

    const url = `${this.config.baseUrl}/admin/realms/${this.config.realm}/users/${userId}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.status === 404) {
      throw new Error(`[KeycloakAdmin] User not found: 404`);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`[KeycloakAdmin] Error fetching user '${userId}': ${response.status} - ${errorText}`);
    }

    const user = (await response.json()) as KeycloakUserRepresentation;
    return user;
  }

  /**
   * Finds users filtered by tenant_slug attribute.
   * Supports search, role filter, enabled filter, and pagination.
   * Throws on Keycloak failure.
   */
  async findUsers(options: FindUsersOptions): Promise<{
    users: KeycloakUserRepresentation[];
    total: number;
  }> {
    const { tenantSlug, search, role, enabled, first = 0, max = 50 } = options;

    const token = await this.getAdminToken();

    // Build query parameters
    const usersParams = new URLSearchParams();
    usersParams.set('q', `tenant_slug:${tenantSlug}`);
    usersParams.set('first', String(first));
    usersParams.set('max', String(max));

    if (search) {
      usersParams.set('search', search);
    }
    if (enabled !== undefined) {
      usersParams.set('enabled', String(enabled));
    }

    // Fetch users
    const usersUrl = `${this.config.baseUrl}/admin/realms/${this.config.realm}/users?${usersParams.toString()}`;
    const usersResponse = await fetch(usersUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!usersResponse.ok) {
      const errorText = await usersResponse.text();
      throw new Error(
        `[KeycloakAdmin] Error fetching users for tenant '${tenantSlug}': ${usersResponse.status} - ${errorText}`,
      );
    }

    let users = (await usersResponse.json()) as KeycloakUserRepresentation[];

    // Build count query parameters
    const countParams = new URLSearchParams();
    countParams.set('q', `tenant_slug:${tenantSlug}`);

    if (search) {
      countParams.set('search', search);
    }
    if (enabled !== undefined) {
      countParams.set('enabled', String(enabled));
    }

    // Fetch total count
    const countUrl = `${this.config.baseUrl}/admin/realms/${this.config.realm}/users/count?${countParams.toString()}`;
    const countResponse = await fetch(countUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!countResponse.ok) {
      const errorText = await countResponse.text();
      throw new Error(
        `[KeycloakAdmin] Error fetching user count for tenant '${tenantSlug}': ${countResponse.status} - ${errorText}`,
      );
    }

    let total = (await countResponse.json()) as number;

    // Apply post-fetch role filter on attributes.user_roles
    if (role) {
      users = users.filter(
        (user) => user.attributes?.user_roles?.includes(role) ?? false,
      );
      // When role filtering is applied, total reflects filtered count
      // since Keycloak doesn't support attribute-value filtering natively
      total = users.length;
    }

    return { users, total };
  }

  /**
   * Updates user profile fields in Keycloak.
   * Fetches the existing user, merges provided fields, and sends the update.
   * If email is provided, also updates username to match.
   * Throws on Keycloak failure.
   */
  async updateUser(options: UpdateUserOptions): Promise<void> {
    const { userId, email, firstName, lastName, enabled, attributes } = options;
    const token = await this.getAdminToken();

    // 1. Fetch the existing user to get current state
    const getUserUrl = `${this.config.baseUrl}/admin/realms/${this.config.realm}/users/${userId}`;
    const getResponse = await fetch(getUserUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!getResponse.ok) {
      const errorText = await getResponse.text();
      throw new Error(
        `[KeycloakAdmin] Error fetching user '${userId}' for update: ${getResponse.status} - ${errorText}`,
      );
    }

    const existingUser = await getResponse.json();

    // 2. Merge provided fields onto the existing user (only overwrite explicitly provided fields)
    const updatedUser = { ...existingUser };

    if (email !== undefined) {
      updatedUser.email = email;
      updatedUser.username = email; // Keycloak uses email as username in this app
    }

    if (firstName !== undefined) {
      updatedUser.firstName = firstName;
    }

    if (lastName !== undefined) {
      updatedUser.lastName = lastName;
    }

    if (enabled !== undefined) {
      updatedUser.enabled = enabled;
    }

    if (attributes !== undefined) {
      updatedUser.attributes = {
        ...existingUser.attributes,
        ...attributes,
      };
    }

    // 3. Send the merged user via PUT
    const putResponse = await fetch(getUserUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(updatedUser),
    });

    if (!putResponse.ok) {
      const errorText = await putResponse.text();
      throw new Error(
        `[KeycloakAdmin] Error updating user '${userId}': ${putResponse.status} - ${errorText}`,
      );
    }
  }

  /**
   * Disables a user in Keycloak (sets enabled=false).
   * Throws on Keycloak failure.
   */
  async disableUser(userId: string): Promise<void> {
    await this.updateUser({ userId, enabled: false });
  }

  /**
   * Enables a user in Keycloak (sets enabled=true).
   * Throws on Keycloak failure.
   */
  async enableUser(userId: string): Promise<void> {
    await this.updateUser({ userId, enabled: true });
  }

  /**
   * Deletes a user from Keycloak entirely.
   * Throws on Keycloak failure.
   */
  async deleteUser(userId: string): Promise<void> {
    const token = await this.getAdminToken();

    const url = `${this.config.baseUrl}/admin/realms/${this.config.realm}/users/${userId}`;

    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `[KeycloakAdmin] Error deleting user '${userId}': ${response.status} - ${errorText}`,
      );
    }
  }

  /**
   * Replaces all application realm roles for a user with the given set.
   * Removes all current app roles and assigns the new ones.
   * Also updates the `user_roles` attribute to match.
   * Throws on Keycloak failure.
   */
  async setRoles(userId: string, roles: string[]): Promise<void> {
    const token = await this.getAdminToken();

    const appRoles = ['admin', 'manager', 'tecnico', 'asistente', 'superusuario', 'platform_admin'];

    // Step 1: Fetch current realm role mappings for the user
    const roleMappingsUrl = `${this.config.baseUrl}/admin/realms/${this.config.realm}/users/${userId}/role-mappings/realm`;

    const mappingsResponse = await fetch(roleMappingsUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!mappingsResponse.ok) {
      const errorText = await mappingsResponse.text();
      throw new Error(
        `[KeycloakAdmin] Error fetching role mappings for user '${userId}': ${mappingsResponse.status} - ${errorText}`,
      );
    }

    const currentRoles = (await mappingsResponse.json()) as Array<{ id: string; name: string }>;

    // Step 2: Filter to only app-level roles
    const currentAppRoles = currentRoles.filter((r) => appRoles.includes(r.name));

    // Step 3: Remove existing app roles (if any)
    if (currentAppRoles.length > 0) {
      const removeResponse = await fetch(roleMappingsUrl, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(currentAppRoles),
      });

      if (!removeResponse.ok) {
        const errorText = await removeResponse.text();
        throw new Error(
          `[KeycloakAdmin] Error removing roles for user '${userId}': ${removeResponse.status} - ${errorText}`,
        );
      }
    }

    // Step 4: Fetch role representations for each new role
    const newRoleRepresentations: Array<{ id: string; name: string }> = [];

    for (const roleName of roles) {
      const roleUrl = `${this.config.baseUrl}/admin/realms/${this.config.realm}/roles/${encodeURIComponent(roleName)}`;

      const roleResponse = await fetch(roleUrl, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!roleResponse.ok) {
        const errorText = await roleResponse.text();
        throw new Error(
          `[KeycloakAdmin] Error fetching role '${roleName}': ${roleResponse.status} - ${errorText}`,
        );
      }

      const roleRepresentation = await roleResponse.json();
      newRoleRepresentations.push(roleRepresentation);
    }

    // Step 5: Assign the new roles
    if (newRoleRepresentations.length > 0) {
      const assignResponse = await fetch(roleMappingsUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(newRoleRepresentations),
      });

      if (!assignResponse.ok) {
        const errorText = await assignResponse.text();
        throw new Error(
          `[KeycloakAdmin] Error assigning roles for user '${userId}': ${assignResponse.status} - ${errorText}`,
        );
      }
    }

    // Step 6: Update the user_roles attribute to match
    await this.updateUser({ userId, attributes: { user_roles: roles } });
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
