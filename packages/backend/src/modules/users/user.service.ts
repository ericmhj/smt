import bcrypt from 'bcrypt';
import { eq, and, or, like, sql, type SQL } from 'drizzle-orm';
import type Redis from 'ioredis';
import type { Database } from '../../db/index.js';
import { users } from '../../db/schema/users.js';
import { getRedisClient } from '../../lib/redis.js';
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

/**
 * Role hierarchy: defines which roles each role can manage.
 * - superusuario can manage: admin, manager, tecnico
 * - admin can manage: manager, tecnico
 * - manager and tecnico cannot manage any users
 */
const ROLE_HIERARCHY: Record<Role, Role[]> = {
  superusuario: ['admin', 'manager', 'tecnico', 'tecnico_de_campo'],
  admin: ['manager', 'tecnico', 'tecnico_de_campo'],
  manager: [],
  tecnico: [],
  tecnico_de_campo: [],
};

function canManageRole(actorRole: Role, targetRole: Role): boolean {
  return ROLE_HIERARCHY[actorRole]?.includes(targetRole) ?? false;
}

function toUserResponse(user: {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): UserResponse {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as Role,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export class UserService {
  private redis: Redis;
  private db: Database;

  constructor(db: Database) {
    this.db = db;
    this.redis = getRedisClient();
  }

  async create(data: CreateUserDTO, actor: JWTPayload): Promise<UserResponse> {
    const actorRole = actor.role as Role;

    // Validate actor has permission to create user with target role
    if (!canManageRole(actorRole, data.role)) {
      throw new UserError(
        403,
        UserErrorCode.CANNOT_MANAGE_ROLE,
        `El rol '${actorRole}' no puede crear usuarios con rol '${data.role}'`,
      );
    }

    // Check if email already exists
    const existing = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, data.email))
      .limit(1);

    if (existing.length > 0) {
      throw new UserError(
        409,
        UserErrorCode.EMAIL_ALREADY_EXISTS,
        `El email '${data.email}' ya está registrado`,
      );
    }

    // Hash password
    const passwordHash = await bcrypt.hash(data.password, 12);

    // Insert user
    const result = await this.db
      .insert(users)
      .values({
        email: data.email,
        passwordHash,
        name: data.name,
        role: data.role,
      })
      .returning();

    const created = result[0];
    return toUserResponse(created!);
  }

  async update(id: string, data: UpdateUserDTO, actor: JWTPayload): Promise<UserResponse> {
    const actorRole = actor.role as Role;

    // Find target user
    const targetResult = await this.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    const target = targetResult[0];
    if (!target) {
      throw new UserError(404, UserErrorCode.USER_NOT_FOUND, 'Usuario no encontrado');
    }

    const targetRole = target.role as Role;

    // Prevent modification of superusuario by non-superusuario
    if (targetRole === 'superusuario' && actorRole !== 'superusuario') {
      throw new UserError(
        403,
        UserErrorCode.CANNOT_MODIFY_SUPERUSUARIO,
        'Solo un superusuario puede modificar a otro superusuario',
      );
    }

    // Validate actor can manage the target's current role
    if (actorRole !== 'superusuario' && !canManageRole(actorRole, targetRole)) {
      throw new UserError(
        403,
        UserErrorCode.CANNOT_MANAGE_ROLE,
        `El rol '${actorRole}' no puede modificar usuarios con rol '${targetRole}'`,
      );
    }

    // If role change, validate hierarchy for new role
    if (data.role && data.role !== targetRole) {
      if (!canManageRole(actorRole, data.role)) {
        throw new UserError(
          403,
          UserErrorCode.CANNOT_MANAGE_ROLE,
          `El rol '${actorRole}' no puede asignar el rol '${data.role}'`,
        );
      }
    }

    // Check email uniqueness if changing email
    if (data.email && data.email !== target.email) {
      const existing = await this.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, data.email))
        .limit(1);

      if (existing.length > 0) {
        throw new UserError(
          409,
          UserErrorCode.EMAIL_ALREADY_EXISTS,
          `El email '${data.email}' ya está registrado`,
        );
      }
    }

    // Build update values
    const updateValues: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (data.name) updateValues.name = data.name;
    if (data.email) updateValues.email = data.email;
    if (data.role) updateValues.role = data.role;
    if (data.isActive !== undefined) updateValues.isActive = data.isActive;
    if (data.password) {
      updateValues.passwordHash = await bcrypt.hash(data.password, 12);
    }

    const updated = await this.db
      .update(users)
      .set(updateValues)
      .where(eq(users.id, id))
      .returning();

    return toUserResponse(updated[0]!);
  }

  async deactivate(id: string, actor: JWTPayload): Promise<void> {
    const actorRole = actor.role as Role;

    // Find target user
    const targetResult = await this.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    const target = targetResult[0];
    if (!target) {
      throw new UserError(404, UserErrorCode.USER_NOT_FOUND, 'Usuario no encontrado');
    }

    const targetRole = target.role as Role;

    // Prevent deactivation of superusuario by non-superusuario
    if (targetRole === 'superusuario' && actorRole !== 'superusuario') {
      throw new UserError(
        403,
        UserErrorCode.CANNOT_MODIFY_SUPERUSUARIO,
        'Solo un superusuario puede desactivar a otro superusuario',
      );
    }

    // Validate actor can manage the target's role
    if (actorRole !== 'superusuario' && !canManageRole(actorRole, targetRole)) {
      throw new UserError(
        403,
        UserErrorCode.CANNOT_MANAGE_ROLE,
        `El rol '${actorRole}' no puede desactivar usuarios con rol '${targetRole}'`,
      );
    }

    // Set is_active = false
    await this.db
      .update(users)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(users.id, id));

    // Immediately revoke all tokens in Redis
    await this.revokeAllTokens(id);
  }

  async delete(id: string, actor: JWTPayload): Promise<void> {
    const actorRole = actor.role as Role;

    // Find target user
    const targetResult = await this.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    const target = targetResult[0];
    if (!target) {
      throw new UserError(404, UserErrorCode.USER_NOT_FOUND, 'Usuario no encontrado');
    }

    const targetRole = target.role as Role;

    // Prevent deletion of superusuario by non-superusuario
    if (targetRole === 'superusuario' && actorRole !== 'superusuario') {
      throw new UserError(
        403,
        UserErrorCode.CANNOT_MODIFY_SUPERUSUARIO,
        'Solo un superusuario puede eliminar a otro superusuario',
      );
    }

    // Prevent self-deletion
    if (actor.sub === id) {
      throw new UserError(
        403,
        UserErrorCode.CANNOT_DELETE_SELF,
        'No puedes eliminar tu propia cuenta',
      );
    }

    // Validate actor can manage the target's role
    if (actorRole !== 'superusuario' && !canManageRole(actorRole, targetRole)) {
      throw new UserError(
        403,
        UserErrorCode.CANNOT_MANAGE_ROLE,
        `El rol '${actorRole}' no puede eliminar usuarios con rol '${targetRole}'`,
      );
    }

    // Delete user from database
    await this.db.delete(users).where(eq(users.id, id));

    // Revoke all tokens
    await this.revokeAllTokens(id);
  }

  async findById(id: string): Promise<UserResponse> {
    const result = await this.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    const user = result[0];
    if (!user) {
      throw new UserError(404, UserErrorCode.USER_NOT_FOUND, 'Usuario no encontrado');
    }

    return toUserResponse(user);
  }

  async findAll(filters: UserFilters): Promise<PaginatedResult<UserResponse>> {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    // Build where conditions
    const conditions: SQL[] = [];

    if (filters.role) {
      if (filters.role === 'tecnico') {
        conditions.push(
          or(eq(users.role, 'tecnico'), eq(users.role, 'tecnico_de_campo'))!,
        );
      } else {
        conditions.push(eq(users.role, filters.role));
      }
    }

    if (filters.isActive !== undefined) {
      conditions.push(eq(users.isActive, filters.isActive));
    }

    if (filters.search) {
      const searchPattern = `%${filters.search}%`;
      conditions.push(
        or(
          like(users.name, searchPattern),
          like(users.email, searchPattern),
        )!,
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const countResult = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(whereClause);

    const total = countResult[0]?.count ?? 0;

    // Get paginated results
    const results = await this.db
      .select()
      .from(users)
      .where(whereClause)
      .limit(pageSize)
      .offset(offset)
      .orderBy(users.createdAt);

    return {
      data: results.map(toUserResponse),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  private async revokeAllTokens(userId: string): Promise<void> {
    const pattern = `refresh:${userId}:*`;
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}
