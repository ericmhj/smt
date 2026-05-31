import type { Role } from './user.types.js';

/**
 * Role hierarchy: defines which roles each role can manage.
 * - superusuario can manage: admin, manager, tecnico
 * - admin can manage: manager, tecnico
 * - manager and tecnico cannot manage any users
 */
export const ROLE_HIERARCHY: Record<Role, Role[]> = {
  superusuario: ['admin', 'manager', 'tecnico', 'tecnico_de_campo'],
  admin: ['manager', 'tecnico', 'tecnico_de_campo'],
  manager: [],
  tecnico: [],
  tecnico_de_campo: [],
};

/**
 * Checks if an actor with the given role can manage users with the target role.
 */
export function canManageRole(actorRole: string, targetRole: string): boolean {
  const manageable = ROLE_HIERARCHY[actorRole as Role];
  if (!manageable) return false;
  return manageable.includes(targetRole as Role);
}
