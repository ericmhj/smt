import type Redis from 'ioredis';
import { getRedisClient } from '../../lib/redis.js';
import { getSqlClient } from '../../db/index.js';
import { UserError, UserErrorCode } from './user.errors.js';
import type {
  CreateUserDTO,
  UpdateUserDTO,
  UserResponse,
  UserFilters,
  PaginatedResult,
  Role,
} from './user.types.js';
import type { JWTPayload } from '../auth/auth.types.js';
import type { KeycloakAdminClient, KeycloakUserRepresentation } from '../tenant/keycloak-admin-client.js';
import { splitName } from './name-utils.js';

/**
 * Role hierarchy: defines which roles each role can manage.
 * - superusuario can manage: admin, manager, tecnico
 * - admin can manage: manager, tecnico
 * - manager and tecnico cannot manage any users
 */
const ROLE_HIERARCHY: Record<Role, Role[]> = {
  platform_admin: ['superusuario', 'admin', 'manager', 'tecnico', 'asistente'],
  superusuario: ['admin', 'manager', 'tecnico', 'asistente'],
  admin: ['manager', 'tecnico', 'asistente'],
  manager: [],
  tecnico: [],
  asistente: [],
};

function canManageRole(actorRole: Role, targetRole: Role): boolean {
  return ROLE_HIERARCHY[actorRole]?.includes(targetRole) ?? false;
}

export class UserService {
  private redis: Redis;
  private keycloakAdmin: KeycloakAdminClient;

  constructor(keycloakAdmin: KeycloakAdminClient) {
    this.keycloakAdmin = keycloakAdmin;
    this.redis = getRedisClient();
  }

  async create(data: CreateUserDTO, actor: JWTPayload): Promise<UserResponse> {
    // 1. Validate role hierarchy: actor's role must be able to manage ALL target roles
    const actorRole = actor.role as Role;
    for (const targetRole of data.roles) {
      if (!canManageRole(actorRole, targetRole)) {
        throw new UserError(
          403,
          UserErrorCode.CANNOT_MANAGE_ROLE,
          `No tiene permisos para asignar el rol '${targetRole}'`,
        );
      }
    }

    // 2. Split the name into firstName/lastName
    const { firstName, lastName } = splitName(data.name);

    // 3. Create the user in Keycloak
    await this.withKeycloakErrorHandling(
      'create',
      { email: data.email, tenantSlug: actor.tenantSlug },
      () =>
        this.keycloakAdmin.createUser({
          email: data.email,
          password: data.password,
          temporary: false,
          tenantSlug: actor.tenantSlug,
          roles: data.roles,
          firstName,
          lastName,
        }),
    );

    // 4. Fetch the created user to get the Keycloak ID
    const { users } = await this.withKeycloakErrorHandling(
      'findUsers',
      { email: data.email, tenantSlug: actor.tenantSlug },
      () =>
        this.keycloakAdmin.findUsers({
          tenantSlug: actor.tenantSlug,
          search: data.email,
          max: 1,
        }),
    );

    const createdUser = users[0];
    const now = new Date().toISOString();

    // 5. Insert into local tenant DB (cache for FK references in forms, reactivos, etc.)
    if (createdUser?.id) {
      try {
        const sql = getSqlClient();
        const primaryRole = data.roles[0] || 'tecnico';
        await sql`
          INSERT INTO users (id, email, name, password_hash, role, is_active)
          VALUES (${createdUser.id}, ${data.email}, ${data.name}, 'keycloak-managed', ${primaryRole}, true)
          ON CONFLICT (id) DO NOTHING
        `;
      } catch (dbError) {
        // Non-blocking: local DB sync failure should not prevent user creation
        console.warn(`[UserService] Local DB insert failed for ${data.email}: ${dbError instanceof Error ? dbError.message : 'unknown'}`);
      }
    }

    // 6. Map to UserResponse
    return {
      id: createdUser?.id ?? '',
      email: data.email,
      name: data.name,
      roles: data.roles,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
  }

  async update(id: string, data: UpdateUserDTO, actor: JWTPayload): Promise<UserResponse> {
    return this.withKeycloakErrorHandling('update', { userId: id, tenantSlug: actor.tenantSlug }, async () => {
      // Fetch existing user
      const existingUser = await this.keycloakAdmin.findUserById(id);

      // Validate tenant isolation
      if (existingUser.attributes?.tenant_slug?.[0] !== actor.tenantSlug) {
        throw new UserError(404, UserErrorCode.USER_NOT_FOUND, 'Usuario no encontrado');
      }

      // Get target's current roles
      const currentRoles = (existingUser.attributes?.user_roles ?? []) as Role[];

      // Validate actor can manage target's current roles
      const actorRole = actor.role as Role;
      for (const role of currentRoles) {
        if (role === 'superusuario' && actorRole !== 'superusuario' && actorRole !== 'platform_admin') {
          throw new UserError(403, UserErrorCode.CANNOT_MODIFY_SUPERUSUARIO, 'No puede modificar un superusuario');
        }
        if (!canManageRole(actorRole, role)) {
          throw new UserError(403, UserErrorCode.CANNOT_MANAGE_ROLE, `No tiene permisos para gestionar el rol ${role}`);
        }
      }

      // Validate actor can manage all new roles if role change is requested
      if (data.roles) {
        for (const newRole of data.roles) {
          if (!canManageRole(actorRole, newRole)) {
            throw new UserError(403, UserErrorCode.CANNOT_MANAGE_ROLE, `No tiene permisos para asignar el rol ${newRole}`);
          }
        }
      }

      // Build and apply profile changes (email, name, isActive)
      const profileChanges: Record<string, unknown> = {};
      if (data.email !== undefined) {
        profileChanges.email = data.email;
      }
      if (data.name !== undefined) {
        const { firstName, lastName } = splitName(data.name);
        profileChanges.firstName = firstName;
        profileChanges.lastName = lastName;
      }
      if (data.isActive !== undefined) {
        profileChanges.enabled = data.isActive;
      }

      if (Object.keys(profileChanges).length > 0) {
        await this.keycloakAdmin.updateUser({ userId: id, ...profileChanges });
      }

      // Reset password if provided
      if (data.password !== undefined) {
        await this.keycloakAdmin.resetPassword({ userId: id, password: data.password, temporary: false });
      }

      // Set roles if provided
      if (data.roles !== undefined) {
        await this.keycloakAdmin.setRoles(id, data.roles);
      }

      // Fetch updated user and return mapped response
      const updatedUser = await this.keycloakAdmin.findUserById(id);
      return this.mapKeycloakUserToResponse(updatedUser);
    });
  }

  async deactivate(id: string, actor: JWTPayload): Promise<void> {
    return this.withKeycloakErrorHandling('deactivate', { userId: id, tenantSlug: actor.tenantSlug }, async () => {
      const existingUser = await this.keycloakAdmin.findUserById(id);

      // Validate tenant isolation
      if (existingUser.attributes?.tenant_slug?.[0] !== actor.tenantSlug) {
        throw new UserError(404, UserErrorCode.USER_NOT_FOUND, 'Usuario no encontrado');
      }

      const targetRoles = existingUser.attributes?.user_roles ?? [];

      // If target has 'superusuario' and actor is not superusuario, deny
      if (targetRoles.includes('superusuario') && actor.role !== 'superusuario') {
        throw new UserError(403, UserErrorCode.CANNOT_MODIFY_SUPERUSUARIO, 'No se puede modificar un superusuario');
      }

      // Validate actor can manage at least one of target's roles (if actor is not superusuario)
      if (actor.role !== 'superusuario' && targetRoles.length > 0) {
        const actorRole = actor.role as Role;
        const canManage = targetRoles.some((r) => canManageRole(actorRole, r as Role));
        if (!canManage) {
          throw new UserError(403, UserErrorCode.CANNOT_MANAGE_ROLE, 'No tiene permisos para gestionar este rol');
        }
      }

      await this.keycloakAdmin.disableUser(id);
      await this.revokeAllTokens(id);
    });
  }

  async delete(id: string, actor: JWTPayload): Promise<void> {
    return this.withKeycloakErrorHandling('delete', { userId: id, tenantSlug: actor.tenantSlug }, async () => {
      const existingUser = await this.keycloakAdmin.findUserById(id);

      // Validate tenant isolation
      if (existingUser.attributes?.tenant_slug?.[0] !== actor.tenantSlug) {
        throw new UserError(404, UserErrorCode.USER_NOT_FOUND, 'Usuario no encontrado');
      }

      // Prevent self-deletion
      if (actor.sub === id) {
        throw new UserError(400, UserErrorCode.CANNOT_DELETE_SELF, 'No puedes eliminarte a ti mismo');
      }

      // Get target's roles
      const targetRoles = (existingUser.attributes?.user_roles ?? []) as Role[];

      // Prevent non-superusuario from modifying superusuario
      if (targetRoles.includes('superusuario') && actor.role !== 'superusuario' && actor.role !== 'platform_admin') {
        throw new UserError(403, UserErrorCode.CANNOT_MODIFY_SUPERUSUARIO, 'No puedes modificar un superusuario');
      }

      // Validate actor can manage all of the target's roles
      const actorRole = actor.role as Role;
      for (const role of targetRoles) {
        if (!canManageRole(actorRole, role as Role)) {
          throw new UserError(403, UserErrorCode.CANNOT_MANAGE_ROLE, `No tienes permisos para gestionar el rol ${role}`);
        }
      }

      await this.keycloakAdmin.deleteUser(id);
      await this.revokeAllTokens(id);
    });
  }

  async findById(id: string, tenantSlug: string): Promise<UserResponse> {
    return this.withKeycloakErrorHandling('findById', { userId: id, tenantSlug }, async () => {
      const user = await this.keycloakAdmin.findUserById(id);

      // Validate tenant isolation
      if (user.attributes?.tenant_slug?.[0] !== tenantSlug) {
        throw new UserError(404, UserErrorCode.USER_NOT_FOUND, 'Usuario no encontrado');
      }

      return this.mapKeycloakUserToResponse(user);
    });
  }

  async findAll(filters: UserFilters, tenantSlug: string): Promise<PaginatedResult<UserResponse>> {
    return this.withKeycloakErrorHandling('findAll', { tenantSlug }, async () => {
      const page = filters.page ?? 1;
      const pageSize = filters.pageSize ?? 20;
      const first = (page - 1) * pageSize;

      const result = await this.keycloakAdmin.findUsers({
        tenantSlug,
        search: filters.search,
        role: filters.role,
        enabled: filters.isActive,
        first,
        max: pageSize,
      });

      const data = result.users.map((user) => this.mapKeycloakUserToResponse(user));

      return {
        data,
        total: result.total,
        page,
        pageSize,
        totalPages: Math.ceil(result.total / pageSize),
      };
    });
  }

  private mapKeycloakUserToResponse(user: KeycloakUserRepresentation): UserResponse {
    return {
      id: user.id,
      email: user.email,
      name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email,
      roles: (user.attributes?.user_roles ?? []) as Role[],
      isActive: user.enabled,
      createdAt: user.createdTimestamp
        ? new Date(user.createdTimestamp).toISOString()
        : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  private async withKeycloakErrorHandling<T>(
    operation: string,
    context: { email?: string; userId?: string; tenantSlug: string },
    fn: () => Promise<T>,
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      // Re-throw UserErrors directly (they're already formatted)
      if (error instanceof UserError) {
        throw error;
      }

      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.error(
        `[UserService] Keycloak operation failed: operation=${operation}, ` +
        `email=${context.email ?? 'N/A'}, userId=${context.userId ?? 'N/A'}, ` +
        `tenant=${context.tenantSlug}, error=${msg}`
      );

      if (msg.includes('409')) {
        throw new UserError(409, UserErrorCode.EMAIL_ALREADY_EXISTS, 'El email ya está registrado en el sistema');
      }
      if (msg.includes('404')) {
        throw new UserError(404, UserErrorCode.USER_NOT_FOUND, 'Usuario no encontrado');
      }

      throw new UserError(
        503,
        UserErrorCode.IDENTITY_PROVIDER_UNAVAILABLE,
        'Servicio de identidad no disponible',
      );
    }
  }

  private async revokeAllTokens(userId: string): Promise<void> {
    const pattern = `refresh:${userId}:*`;
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}
