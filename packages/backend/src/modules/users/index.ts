export { UserService } from './user.service.js';
export { UserError, UserErrorCode } from './user.errors.js';
export { userRoutes } from './user.routes.js';
export { requireRole } from './rbac.middleware.js';
export { canManageRole, ROLE_HIERARCHY } from './rbac.helpers.js';
export type {
  CreateUserDTO,
  UpdateUserDTO,
  UserResponse,
  UserFilters,
  PaginatedResult,
  Role,
} from './user.types.js';
