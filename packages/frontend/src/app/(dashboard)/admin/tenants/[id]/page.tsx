'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

interface TenantDetail {
  id: string;
  slug: string;
  nombre: string;
  plan: string;
  status: string;
  config: Record<string, unknown>;
  scheduledDeletionAt: string | null;
  createdAt: string;
  updatedAt: string;
  metrics: {
    userCount: number;
    adminEmail: string;
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

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTenant = async () => {
    try {
      const data = await api<TenantDetail>(`/api/platform/tenants/${id}`);
      setTenant(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar el tenant');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTenant();
  }, [id]);

  const handleSuspend = async () => {
    setActionLoading(true);
    setError(null);
    try {
      await api(`/api/platform/tenants/${id}/suspend`, { method: 'PUT' });
      await fetchTenant();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al suspender');
    } finally {
      setActionLoading(false);
    }
  };

  const handleActivate = async () => {
    setActionLoading(true);
    setError(null);
    try {
      await api(`/api/platform/tenants/${id}/activate`, { method: 'PUT' });
      await fetchTenant();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al reactivar');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    setActionLoading(true);
    setError(null);
    try {
      await api(`/api/platform/tenants/${id}`, { method: 'DELETE' });
      await fetchTenant();
      setShowDeleteDialog(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al programar eliminación');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Cargando...</div>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">{error || 'Tenant no encontrado'}</p>
        <Link href="/admin/tenants" className="text-blue-600 hover:text-blue-800 text-sm mt-2 inline-block">
          Volver a la lista
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Link href="/admin/tenants" className="text-sm text-blue-600 hover:text-blue-800">
          ← Volver a Tenants
        </Link>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{tenant.nombre}</h1>
            <p className="text-sm text-gray-500 font-mono mt-1">{tenant.slug}.sgr.com</p>
          </div>
          <span
            className={`px-3 py-1 text-sm font-medium rounded-full ${statusStyles[tenant.status] || 'bg-gray-100 text-gray-800'}`}
          >
            {statusLabels[tenant.status] || tenant.status}
          </span>
        </div>
      </div>

      {/* Details */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Información</h2>
        <dl className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <dt className="text-sm text-gray-500">URL de Acceso</dt>
            <dd className="text-sm font-medium">
              <a href={`http://${tenant.slug}.localhost:3000`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 font-mono">
                {tenant.slug}.localhost:3000
              </a>
            </dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500">Admin Email</dt>
            <dd className="text-sm font-medium text-gray-900 font-mono">{tenant.metrics.adminEmail || '—'}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500">Plan</dt>
            <dd className="text-sm font-medium text-gray-900 capitalize">{tenant.plan}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500">Usuarios</dt>
            <dd className="text-sm font-medium text-gray-900">{tenant.metrics.userCount}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500">Creado</dt>
            <dd className="text-sm font-medium text-gray-900">
              {new Date(tenant.createdAt).toLocaleDateString('es-MX', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </dd>
          </div>
          {tenant.scheduledDeletionAt && (
            <div className="col-span-2">
              <dt className="text-sm text-gray-500">Eliminación programada</dt>
              <dd className="text-sm font-medium text-red-600">
                {new Date(tenant.scheduledDeletionAt).toLocaleDateString('es-MX', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </dd>
            </div>
          )}
        </dl>
      </div>

      {/* Reset Password */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Administrar Contraseña</h2>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-sm text-gray-500 mb-1">Nueva contraseña para admin</label>
            <input
              type="text"
              id="newPassword"
              placeholder="Mínimo 6 caracteres"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
          <button
            onClick={async () => {
              const input = document.getElementById('newPassword') as HTMLInputElement;
              if (!input.value || input.value.length < 6) { alert('Mínimo 6 caracteres'); return; }
              setActionLoading(true);
              try {
                await api(`/api/platform/tenants/${id}/reset-password`, {
                  method: 'PUT',
                  body: JSON.stringify({ newPassword: input.value }),
                });
                alert('Contraseña reseteada. Nuevo password: ' + input.value);
                input.value = '';
              } catch (err) {
                alert(err instanceof Error ? err.message : 'Error');
              } finally {
                setActionLoading(false);
              }
            }}
            disabled={actionLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm whitespace-nowrap"
          >
            Resetear
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Acciones</h2>
        <div className="flex flex-wrap gap-3">
          {tenant.status === 'active' && (
            <>
              <button
                onClick={handleSuspend}
                disabled={actionLoading}
                className="px-4 py-2 text-sm font-medium text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-md hover:bg-yellow-100 disabled:opacity-50"
              >
                Suspender
              </button>
              <button
                onClick={() => setShowDeleteDialog(true)}
                disabled={actionLoading}
                className="px-4 py-2 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 disabled:opacity-50"
              >
                Programar Eliminación
              </button>
            </>
          )}
          {(tenant.status === 'suspended' || tenant.status === 'pending_deletion') && (
            <button
              onClick={handleActivate}
              disabled={actionLoading}
              className="px-4 py-2 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-md hover:bg-green-100 disabled:opacity-50"
            >
              Reactivar
            </button>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {showDeleteDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              ¿Programar eliminación?
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              El tenant <strong>{tenant.nombre}</strong> será marcado para eliminación.
              Los datos se conservarán durante un período de gracia de <strong>30 días</strong>,
              después del cual el schema y todos los datos serán eliminados permanentemente.
            </p>
            <p className="text-sm text-gray-600 mb-4">
              Durante este período, podrás reactivar el tenant si es necesario.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteDialog(false)}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={actionLoading}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                {actionLoading ? 'Procesando...' : 'Confirmar Eliminación'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
