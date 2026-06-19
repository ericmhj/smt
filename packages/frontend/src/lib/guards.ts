type Role = 'platform_admin' | 'superusuario' | 'admin' | 'manager' | 'tecnico' | 'asistente';

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

export function getDefaultRoute(role: Role): string {
  switch (role) {
    case 'platform_admin':
      return '/admin/tenants';
    case 'superusuario':
    case 'admin':
      return '/kanban';
    case 'manager':
      return '/kanban';
    case 'asistente':
      return '/clientes';
    case 'tecnico':
      return '/my-forms';
    default:
      return '/';
  }
}
