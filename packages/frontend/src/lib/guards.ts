export type Role = 'platform_admin' | 'superusuario' | 'admin' | 'manager' | 'tecnico' | 'asistente';

const routePermissions: Record<string, Role[]> = {
  '/admin': ['platform_admin'],
  '/users': ['superusuario', 'admin'],
  '/forms': ['superusuario', 'admin', 'manager'],
  '/assignments': ['superusuario', 'admin', 'manager'],
  '/kanban': ['superusuario', 'admin', 'manager'],
  '/clientes': ['manager', 'asistente'],
  '/tickets': ['manager', 'asistente'],
  '/configuracion': ['manager'],
  '/my-forms': ['tecnico'],
  '/my-kanban': ['tecnico'],
};

/**
 * Role-to-default-route mapping for post-login redirect.
 * Each role is directed to their primary working view after login.
 */
const defaultRouteByRole: Record<Role, string> = {
  platform_admin: '/admin/tenants',
  superusuario: '/kanban',
  admin: '/kanban',
  manager: '/kanban',
  tecnico: '/my-forms',
  asistente: '/clientes',
};

const DEFAULT_FALLBACK_ROUTE = '/';

export function canAccessRoute(role: Role, pathname: string): boolean {
  // Find matching route permission
  for (const [route, allowedRoles] of Object.entries(routePermissions)) {
    if (pathname.startsWith(route)) {
      return allowedRoles.includes(role);
    }
  }
  // Default: allow access
  return true;
}

/**
 * Returns the default dashboard route for a given role.
 * Used for post-login redirect to the appropriate role-specific view.
 *
 * Validates: Requirements 4.3
 */
export function getDefaultRoute(role: string): string {
  if (role in defaultRouteByRole) {
    return defaultRouteByRole[role as Role];
  }
  return DEFAULT_FALLBACK_ROUTE;
}
