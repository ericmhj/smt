'use client';

import Link from 'next/link';

export interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

interface UserTableProps {
  users: UserRow[];
  onToggleActive?: (id: string, isActive: boolean) => void;
}

const roleLabels: Record<string, string> = {
  superusuario: 'Superusuario',
  admin: 'Administrador',
  manager: 'Manager',
  tecnico: 'Técnico de Campo',
  tecnico_de_campo: 'Técnico de Campo',
};

export default function UserTable({ users, onToggleActive }: UserTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nombre</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rol</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Acciones</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {users.map((user) => (
            <tr key={user.id}>
              <td className="px-4 py-3 text-sm text-gray-900">{user.name}</td>
              <td className="px-4 py-3 text-sm text-gray-500">{user.email}</td>
              <td className="px-4 py-3 text-sm text-gray-500">{roleLabels[user.role] || user.role}</td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                    user.isActive
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  {user.isActive ? 'Activo' : 'Inactivo'}
                </span>
              </td>
              <td className="px-4 py-3 text-sm space-x-2">
                <Link
                  href={`/users/${user.id}/edit`}
                  className="text-blue-600 hover:text-blue-800"
                >
                  Editar
                </Link>
                {onToggleActive && (
                  <button
                    onClick={() => onToggleActive(user.id, !user.isActive)}
                    className={`${
                      user.isActive ? 'text-red-600 hover:text-red-800' : 'text-green-600 hover:text-green-800'
                    }`}
                  >
                    {user.isActive ? 'Desactivar' : 'Activar'}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {users.length === 0 && (
        <p className="text-center text-gray-500 py-8">No se encontraron usuarios.</p>
      )}
    </div>
  );
}
