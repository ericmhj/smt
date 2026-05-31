'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import UserTable, { UserRow } from '@/components/users/UserTable';

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('');

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (roleFilter) params.set('role', roleFilter);
      if (activeFilter) params.set('isActive', activeFilter);
      const response = await api<{ data: UserRow[] }>(`/api/users?${params.toString()}`);
      setUsers(response.data || []);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [roleFilter, activeFilter]);

  const handleToggleActive = async (id: string, isActive: boolean) => {
    try {
      if (isActive) {
        // Reactivate: use PATCH update with role (backend doesn't have a dedicated activate endpoint for users)
        await api(`/api/users/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ isActive: true }),
        });
      } else {
        // Deactivate
        await api(`/api/users/${id}/deactivate`, {
          method: 'PATCH',
        });
      }
      fetchUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Usuarios</h1>
        <Link
          href="/users/new"
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Nuevo usuario
        </Link>
      </div>

      <div className="flex gap-4 mb-4">
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        >
          <option value="">Todos los roles</option>
          <option value="superusuario">Superusuario</option>
          <option value="admin">Administrador</option>
          <option value="manager">Manager</option>
          <option value="tecnico">Técnico de Campo</option>
        </select>

        <select
          value={activeFilter}
          onChange={(e) => setActiveFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        >
          <option value="">Todos</option>
          <option value="true">Activos</option>
          <option value="false">Inactivos</option>
        </select>
      </div>

      {loading ? (
        <p className="text-gray-500">Cargando...</p>
      ) : (
        <div className="bg-white rounded-lg shadow">
          <UserTable users={users} onToggleActive={handleToggleActive} />
        </div>
      )}
    </div>
  );
}
