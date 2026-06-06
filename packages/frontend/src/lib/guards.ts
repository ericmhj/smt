type Role = 'superusuario' | 'admin' | 'manager' | 'tecnico' | 'asistente';

const routePermissions: Record<string, Role[]> = {
  '/users': ['superusuario', 'admin'],
  '/forms': ['superusuario', 'admin', 'manager'],
  '/assignments': ['superusuario', 'admin', 'manager'],
  '/kanban': ['superusuario', 'admin', 'manager'],
  '/clientes': ['manager', 'asistente'],
  '/tickets': ['manager', 'asistente'],
  '/configuracion': ['manager'],
  '/my-forms': ['tecnico'],
  '/my-reactivos': ['tecnico'],
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
