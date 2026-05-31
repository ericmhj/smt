'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

interface NavItem {
  label: string;
  href: string;
  roles: string[];
}

const navItems: NavItem[] = [
  { label: 'Tablero Kanban', href: '/kanban', roles: ['superusuario', 'admin', 'manager'] },
  { label: 'Usuarios', href: '/users', roles: ['superusuario', 'admin'] },
  { label: 'Formularios', href: '/forms', roles: ['superusuario', 'admin', 'manager'] },
  { label: 'Asignaciones', href: '/assignments', roles: ['superusuario', 'admin', 'manager'] },
  { label: 'Mis Formularios', href: '/my-forms', roles: ['tecnico', 'tecnico_de_campo'] },
  { label: 'Mis Reactivos', href: '/my-reactivos', roles: ['tecnico', 'tecnico_de_campo'] },
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
        <p className="text-xs text-gray-500">Sistema de Gestión de Reactivos</p>
      </div>
      <nav className="space-y-1">
        {visibleItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
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
