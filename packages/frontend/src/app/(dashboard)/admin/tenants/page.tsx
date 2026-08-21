'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { createColumnHelper } from '@tanstack/react-table';
import DataTable from '@/components/ui/DataTable';

interface Tenant {
  id: string;
  hashId: string;
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
  active: 'bg-green-100 text-green-800 hover:bg-green-200',
  suspended: 'bg-red-100 text-red-800 hover:bg-red-200',
  pending_deletion: 'bg-red-100 text-red-800 hover:bg-red-200',
};

const statusLabels: Record<string, string> = {
  active: 'Activo',
  suspended: 'Inactivo',
  pending_deletion: 'Inactivo',
};

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTenants = async () => {
    setLoading(true);
    try {
      const response = await api<TenantsResponse>('/api/platform/tenants?limit=100');
      setTenants(response.data);
    } catch (error) {
      console.error('Error fetching tenants:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTenants(); }, []);

  const handleToggleStatus = async (tenant: Tenant) => {
    try {
      if (tenant.status === 'active') {
        await api(`/api/platform/tenants/${tenant.id}/suspend`, { method: 'PUT' });
      } else {
        await api(`/api/platform/tenants/${tenant.id}/activate`, { method: 'PUT' });
      }
      await fetchTenants();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al cambiar estado');
    }
  };

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

      {loading ? (
        <div className="text-center py-8 text-gray-500">Cargando...</div>
      ) : (
        <TenantsDataTable tenants={tenants} onToggleStatus={handleToggleStatus} />
      )}
    </div>
  );
}

// ─── DataTable sub-component ─────────────────────────────────────────────────

const tenantColumnHelper = createColumnHelper<Tenant>();

function TenantsDataTable({
  tenants,
  onToggleStatus,
}: {
  tenants: Tenant[];
  onToggleStatus: (t: Tenant) => void;
}) {
  const columns = useMemo(() => [
    tenantColumnHelper.accessor('hashId', {
      header: 'ID',
      cell: (info) => <span className="font-mono text-gray-500 text-xs">{info.getValue() || '—'}</span>,
    }),
    tenantColumnHelper.accessor('nombre', {
      header: 'Nombre',
      cell: (info) => (
        <Link
          href={`/admin/tenants/${info.row.original.id}`}
          className="font-medium text-blue-600 hover:text-blue-800"
        >
          {info.getValue()}
        </Link>
      ),
    }),
    tenantColumnHelper.accessor('slug', {
      header: 'URL de Acceso',
      cell: (info) => (
        <a
          href={`http://${info.getValue()}.localhost:3000`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-mono text-blue-600 hover:text-blue-800 underline"
        >
          {info.getValue()}.localhost:3000
        </a>
      ),
    }),
    tenantColumnHelper.accessor('adminEmail', {
      header: 'Admin (Usuario)',
      cell: (info) => <span className="text-gray-700 font-mono">{info.getValue() || '—'}</span>,
    }),
    tenantColumnHelper.accessor('plan', {
      header: 'Plan',
      cell: (info) => <span className="text-gray-600 capitalize">{info.getValue()}</span>,
    }),
    tenantColumnHelper.accessor('status', {
      header: 'Estado',
      filterFn: (row, _columnId, filterValue) => {
        const label = statusLabels[row.original.status] || row.original.status;
        return label.toLowerCase().startsWith(filterValue.toLowerCase());
      },
      cell: (info) => {
        const t = info.row.original;
        return (
          <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusStyles[t.status] || 'bg-gray-100 text-gray-800'}`}>
            {statusLabels[t.status] || t.status}
          </span>
        );
      },
    }),
  ], [onToggleStatus]);

  return <DataTable data={tenants} columns={columns} columnFiltering globalFilter={false} />;
}
