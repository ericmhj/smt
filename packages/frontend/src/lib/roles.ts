import type { Role } from './guards';

export interface RoleOption {
  value: Role;
  label: string;
}

/**
 * Canonical, ordered list of application roles with their display labels.
 * This is the single source consumed by the user management form dropdowns.
 */
const ALL_ROLE_OPTIONS: RoleOption[] = [
  { value: 'tecnico', label: 'Técnico' },
  { value: 'asistente', label: 'Asistente' },
  { value: 'manager', label: 'Manager' },
  { value: 'admin', label: 'Administrador' },
  { value: 'superusuario', label: 'Superusuario' },
];

/**
 * Roles that must never be offered for selection/filtering in the user form.
 * For now only 'superusuario' is discarded.
 */
const EXCLUDED_ROLES: Role[] = ['superusuario'];

/**
 * Custom loader invoked when the user form renders its role dropdowns.
 * Returns the selectable role options, discarding excluded roles
 * (currently 'superusuario') from the query.
 */
export function getSelectableRoleOptions(): RoleOption[] {
  return ALL_ROLE_OPTIONS.filter((option) => !EXCLUDED_ROLES.includes(option.value));
}
