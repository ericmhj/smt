type Role = 'superusuario' | 'administrador' | 'manager' | 'tecnico_de_campo';

const routePermissions: Record<string, Role[]> = {
  '/users': ['superusuario', 'administrador'],
  '/forms': ['superusuario', 'administrador', 'manager'],
  '/assignments': ['superusuario', 'administrador', 'manager'],
  '/kanban': ['superusuario', 'administrador', 'manager'],
  '/my-forms': ['tecnico_de_campo'],
  '/my-reactivos': ['tecnico_de_campo'],
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
    case 'administrador':
      return '/kanban';
    case 'manager':
      return '/kanban';
    case 'tecnico_de_campo':
      return '/my-forms';
    default:
      return '/';
  }
}
