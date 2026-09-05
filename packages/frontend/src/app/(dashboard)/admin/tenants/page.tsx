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

// Estado homologado a solo dos valores visibles: Activo o Suspendido.
// Cualquier estado que no sea 'active' se muestra como Suspendido
// (incluye suspended, onboarding, cancelled, pending_deletion).
// La etiqueta es SOLO informativa: refleja el estado sincronizado desde el
// license-service (pago mensual del tenant). No invoca ninguna acción.
function normalizeStatus(status: string): 'active' | 'suspended' {
  return status === 'active' ? 'active' : 'suspended';
}

const statusStyles: Record<'active' | 'suspended', string> = {
  active: 'bg-green-100 text-green-800',
  suspended: 'bg-red-100 text-red-800',
};

const statusLabels: Record<'active' | 'suspended', string> = {
  active: 'Activo',
  suspended: 'Suspendido',
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

  const [reconciling, setReconciling] = useState(false);

  useEffect(() => { fetchTenants(); }, []);

  const handleReconcile = async () => {
    setReconciling(true);
    try {
      const result = await api<{ created: string[]; skipped: number; failed: Array<{ slug: string; error: string }> }>(
        '/api/platform/tenants/reconcile',
        { method: 'POST' },
      );
      const createdCount = result.created?.length ?? 0;
      const failedCount = result.failed?.length ?? 0;
      alert(
        `Reconciliación completada.\nCreados: ${createdCount}\nSin cambios: ${result.skipped ?? 0}\nFallidos: ${failedCount}` +
          (failedCount > 0 ? `\n\nFallidos:\n${result.failed.map((f) => `- ${f.slug}: ${f.error}`).join('\n')}` : ''),
      );
      await fetchTenants();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al reconciliar');
    } finally {
      setReconciling(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestión de Tenants</h1>
          <p className="text-sm text-gray-500 mt-1">Administra las organizaciones de la plataforma</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleReconcile}
            disabled={reconciling}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors text-sm font-medium disabled:opacity-50"
            title="Materializa en SMT los tenants que existan en el sistema de licencias pero falten aquí"
          >
            {reconciling ? 'Reconciliando...' : 'Reconciliar'}
          </button>
          <Link
            href="/admin/tenants/nuevo"
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            Crear Tenant
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-500">Cargando...</div>
      ) : (
        <TenantsDataTable tenants={tenants} />
      )}
    </div>
  );
}

// ─── DataTable sub-component ─────────────────────────────────────────────────

const tenantColumnHelper = createColumnHelper<Tenant>();

function TenantsDataTable({ tenants }: { tenants: Tenant[] }) {
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
        const label = statusLabels[normalizeStatus(row.original.status)];
        return label.toLowerCase().startsWith(filterValue.toLowerCase());
      },
      cell: (info) => {
        const normalized = normalizeStatus(info.row.original.status);
        return (
          <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusStyles[normalized]}`}>
            {statusLabels[normalized]}
          </span>
        );
      },
    }),
  ], []);

  return <DataTable data={tenants} columns={columns} columnFiltering globalFilter={false} />;
}
