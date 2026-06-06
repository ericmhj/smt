'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

interface NavItem {
  label: string;
  href: string;
  roles: string[];
  children?: NavItem[];
}

const navItems: NavItem[] = [
  { label: 'Estado de los Ensayos', href: '/kanban', roles: ['superusuario', 'admin', 'manager'] },
  { label: 'Usuarios', href: '/users', roles: ['superusuario', 'admin'] },
  { label: 'Formularios', href: '/forms', roles: ['superusuario', 'admin', 'manager'] },
  { label: 'Asignaciones', href: '/assignments', roles: ['superusuario', 'admin', 'manager'] },
  { label: 'Clientes', href: '/clientes', roles: ['manager', 'asistente'] },
  { label: 'Tickets', href: '/tickets', roles: ['manager', 'asistente'] },
  {
    label: 'Configuración',
    href: '/configuracion',
    roles: ['manager'],
    children: [
      { label: 'SLA', href: '/configuracion/sla', roles: ['manager'] },
      { label: 'Reglas de Asignación', href: '/configuracion/asignacion', roles: ['manager'] },
    ],
  },
  { label: 'Mis Formularios', href: '/my-forms', roles: ['tecnico'] },
  { label: 'Mis Ensayos', href: '/my-reactivos', roles: ['tecnico'] },
];

export default function Sidebar() {
  const { user } = useAuth();
  const pathname = usePathname();

  if (!user) return null;

  const visibleItems = navItems.filter((item) => item.roles.includes(user.role));

  return (
    <aside className="w-64 bg-white border-r border-gray-200 min-h-screen p-4">
      <div className="mb-8">
        <h1 className="text-xl font-bold text-gray-800">SGR</h1>
        <p className="text-xs text-gray-500">Sistema de Gestión de Ensayos</p>
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-sm font-medium text-gray-700 truncate">{user.name}</p>
          <p className="text-xs text-gray-500 capitalize">{user.role === 'tecnico' ? 'Técnico' : user.role === 'admin' ? 'Administrador' : user.role}</p>
        </div>
      </div>
      <nav className="space-y-1">
        {visibleItems.map((item) => {
          const isActive = pathname.startsWith(item.href);

          if (item.children) {
            const visibleChildren = item.children.filter((c) => c.roles.includes(user.role));
            if (visibleChildren.length === 0) return null;
            return (
              <div key={item.href}>
                <span className="block px-3 py-2 text-xs font-semibold text-gray-500 uppercase mt-3">
                  {item.label}
                </span>
                {visibleChildren.map((child) => {
                  const childActive = pathname.startsWith(child.href);
                  return (
                    <Link
                      key={child.href}
                      href={child.href}
                      className={`block px-3 py-2 pl-6 rounded-md text-sm font-medium transition-colors ${
                        childActive
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                    >
                      {child.label}
                    </Link>
                  );
                })}
              </div>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
