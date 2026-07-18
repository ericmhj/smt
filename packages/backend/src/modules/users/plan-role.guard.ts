import type { AppConfig } from '../../lib/config.js';

/**
 * Validates that a role is authorized by the tenant's plan.
 * In standalone mode, all roles are allowed.
 * In integrated mode, queries License Service (or Redis) for plan limits.
 */

// Hardcoded for MVP — will be replaced by License Service query
const PLAN_ROLES: Record<string, string[]> = {
  PLAN_BASICO: ['tecnico'],
  PLAN_PRO: ['tecnico', 'asistente', 'manager'],
  PLAN_ENTERPRISE: ['tecnico', 'asistente', 'manager', 'admin', 'superusuario'],
};

export function isRoleAuthorizedByPlan(role: string, planType: string | undefined, standaloneAuth: boolean): boolean {
  // In standalone mode, all roles are allowed
  if (standaloneAuth || !planType) return true;

  const allowedRoles = PLAN_ROLES[planType];
  if (!allowedRoles) return true; // Unknown plan = allow (fail-open)

  return allowedRoles.includes(role);
}

export function getAllowedRolesForPlan(planType: string | undefined): string[] {
  if (!planType) return ['tecnico', 'asistente', 'manager', 'admin', 'superusuario'];
  return PLAN_ROLES[planType] ?? ['tecnico', 'asistente', 'manager', 'admin', 'superusuario'];
}
