import type { Role } from './user.types.js';

/**
 * Role hierarchy: defines which roles each role can manage.
 * Kept in sync with the hierarchy in user.service.ts (single source of truth).
 * - platform_admin can manage: superusuario, admin, manager, tecnico, asistente
 * - superusuario can manage: admin, manager, tecnico, asistente
 * - admin can manage: admin (peers), manager, tecnico, asistente
 * - manager, tecnico, asistente cannot manage any users
 */
export const ROLE_HIERARCHY: Record<Role, Role[]> = {
  platform_admin: ['superusuario', 'admin', 'manager', 'tecnico', 'asistente'],
  superusuario: ['admin', 'manager', 'tecnico', 'asistente'],
  admin: ['admin', 'manager', 'tecnico', 'asistente'],
  manager: [],
  tecnico: [],
  asistente: [],
};

/**
 * Checks if an actor with the given role can manage users with the target role.
 */
export function canManageRole(actorRole: string, targetRole: string): boolean {
  const manageable = ROLE_HIERARCHY[actorRole as Role];
  if (!manageable) return false;
  return manageable.includes(targetRole as Role);
}
