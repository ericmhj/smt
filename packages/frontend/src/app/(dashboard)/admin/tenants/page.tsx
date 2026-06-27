'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface Tenant {
  id: string;
  slug: string;
  nombre: string;
  plan: string;
  status: string;
  createdAt: string;
  adminEmail?: string;
}

interface TenantsResponse {
  data: Tenant[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const statusStyles: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  suspended: 'bg-yellow-100 text-yellow-800',
  pending_deletion: 'bg-red-100 text-red-800',
};

const statusLabels: Record<string, string> = {
  active: 'Activo',
  suspended: 'Suspendido',
  pending_deletion: 'Pendiente de eliminación',
};

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');

  const fetchTenants = async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (statusFilter) params.append('status', statusFilter);

      const response = await api<TenantsResponse>(`/api/platform/tenants?${params}`);
      setTenants(response.data);
      setPagination(response.pagination);
    } catch (error) {
      console.error('Error fetching tenants:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTenants();
  }, [statusFilter]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestión de Tenants</h1>
          <p className="text-sm text-gray-500 mt-1">Administra las organizaciones de la plataforma</p>
        </div>
        <Link
          href="/admin/tenants/nuevo"
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          Crear Tenant
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
          aria-label="Filtrar por estado"
        >
          <option value="">Todos los estados</option>
          <option value="active">Activo</option>
          <option value="suspended">Suspendido</option>
          <option value="pending_deletion">Pendiente de eliminación</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nombre</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">URL de Acceso</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Admin (Usuario)</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Plan</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-4 text-center text-gray-500">Cargando...</td>
              </tr>
            ) : tenants.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-4 text-center text-gray-500">No se encontraron tenants</td>
              </tr>
            ) : (
              tenants.map((tenant) => {
                const tenantUrl = `http://${tenant.slug}.localhost:3000`;
                return (
                  <tr key={tenant.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4 whitespace-nowrap">
                      <Link
                        href={`/admin/tenants/${tenant.id}`}
                        className="text-sm font-medium text-blue-600 hover:text-blue-800"
                      >
                        {tenant.nombre}
                      </Link>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <a
                        href={tenantUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-mono text-blue-600 hover:text-blue-800 underline"
                      >
                        {tenant.slug}.localhost:3000
                      </a>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-700 font-mono">
                      {tenant.adminEmail || '—'}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600 capitalize">{tenant.plan}</td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusStyles[tenant.status] || 'bg-gray-100 text-gray-800'}`}>
                        {statusLabels[tenant.status] || tenant.status}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Mostrando {tenants.length} de {pagination.total} tenants
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => fetchTenants(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="px-3 py-1 text-sm border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Anterior
            </button>
            <span className="px-3 py-1 text-sm text-gray-600">
              Página {pagination.page} de {pagination.totalPages}
            </span>
            <button
              onClick={() => fetchTenants(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="px-3 py-1 text-sm border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
