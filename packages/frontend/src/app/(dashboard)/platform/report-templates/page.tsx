'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { ThemePanel } from './components/ThemePanel';
import { createColumnHelper } from '@tanstack/react-table';
import DataTable from '@/components/ui/DataTable';

interface Tenant {
  id: string;
  slug: string;
  nombre: string;
}

interface TemplateSection {
  id: string;
  type: string;
  title: string;
  order: number;
  is_active: boolean;
  config: Record<string, unknown>;
}

interface ReportTemplate {
  id: string;
  formType: string | null;
  tenantFormId: string | null;
  name: string;
  description: string | null;
  isActive: boolean;
  sections: TemplateSection[];
  createdAt: string;
}

interface Activation {
  id: string;
  report_template_id: string;
  activated_by: string;
  activated_at: string;
  theme_config: Record<string, unknown> | null;
}

const SECTION_TYPE_LABELS: Record<string, string> = {
  static: 'Estático',
  form_content: 'Contenido',
  signatures: 'Firmas',
  custom_html: 'HTML',
  observations: 'Observaciones',
  state_history: 'Historial',
};

export default function ReportTemplatesPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenant, setSelectedTenant] = useState('');
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [activations, setActivations] = useState<Activation[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterFormType, setFilterFormType] = useState('');
  const [tenantForms, setTenantForms] = useState<Array<{ id: string; form_type: string; name: string }>>([]);
  const [themeTarget, setThemeTarget] = useState<{ activationId: string; themeConfig: any; formId?: string } | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Load tenants
  useEffect(() => {
    api<{ data: Tenant[] }>('/api/platform/tenants?limit=100')
      .then((res) => setTenants(res.data || []))
      .catch(() => {});
  }, []);

  // Load tenant forms (only when tenant is selected)
  useEffect(() => {
    if (!selectedTenant) {
      setTenantForms([]);
      setFilterFormType('');
      return;
    }
    api<Array<{ id: string; form_type: string | null; name: string; is_active: boolean }>>(`/api/platform/tenants/${selectedTenant}/forms`)
      .then((forms) => {
        const items = forms
          .filter((f) => f.form_type && f.is_active)
          .map((f) => ({ id: f.id, form_type: f.form_type!, name: f.name }));
        setTenantForms(items);
        if (filterFormType && !items.some((f) => f.id === filterFormType)) {
          setFilterFormType('');
        }
      })
      .catch(() => {
        setTenantForms([]);
      });
  }, [selectedTenant]);

  // Load templates filtered by selected form or tenant
  const fetchTemplates = async () => {
    setLoading(true);
    try {
      let url = '/api/report-templates';
      if (filterFormType) {
        const form = tenantForms.find((f) => f.id === filterFormType);
        if (form) {
          url = `/api/report-templates?form_type=${encodeURIComponent(form.form_type)}`;
        }
      }
      const data = await api<ReportTemplate[]>(url);

      // Filter: only show templates whose form_type matches one of the tenant's active forms
      if (selectedTenant && tenantForms.length > 0) {
        const tenantFormTypes = new Set(tenantForms.map(f => f.form_type));
        const filtered = data.filter(t => !t.formType || tenantFormTypes.has(t.formType));
        setTemplates(filtered);
      } else {
        setTemplates(data);
      }
    } catch (error) {
      console.error('Error fetching report templates:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, [filterFormType, selectedTenant, tenantForms]);

  // Load activations when tenant changes
  const fetchActivations = async () => {
    if (!selectedTenant) {
      setActivations([]);
      return;
    }
    try {
      const data = await api<Activation[]>(
        `/api/platform/tenants/${selectedTenant}/report-template-activations`,
      );
      setActivations(data);
    } catch {
      setActivations([]);
    }
  };

  useEffect(() => {
    fetchActivations();
  }, [selectedTenant]);

  const handleToggle = async (id: string) => {
    try {
      await api(`/api/report-templates/${id}/toggle`, { method: 'PATCH' });
      await fetchTemplates();
    } catch (error) {
      console.error('Error toggling template:', error);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`¿Eliminar el template "${name}"? Esta acción no se puede deshacer.`)) return;
    try {
      await api(`/api/report-templates/${id}`, { method: 'DELETE' });
      await fetchTemplates();
    } catch (error) {
      console.error('Error deleting template:', error);
    }
  };

  const handleActivateForTenant = async (templateId: string) => {
    if (!selectedTenant) return;
    try {
      const activation = await api<{ id: string }>(`/api/platform/tenants/${selectedTenant}/report-template-activations`, {
        method: 'POST',
        body: JSON.stringify({ report_template_id: templateId }),
      });

      // Auto-apply theme from form colors
      if (activation?.id) {
        try {
          await api(`/api/platform/tenants/${selectedTenant}/report-template-activations/${activation.id}/auto-theme`, {
            method: 'POST',
          });
        } catch {
          // Non-blocking: theme will use defaults if auto-theme fails
        }
      }

      await fetchActivations();
    } catch (error: any) {
      const message = error?.data?.message || error?.message || 'Error al activar template';
      setNotification({ message, type: 'error' });
    }
  };

  const handleDeactivateForTenant = async (templateId: string) => {
    if (!selectedTenant) return;
    const activation = activations.find((a) => a.report_template_id === templateId);
    if (!activation) return;
    try {
      await api(
        `/api/platform/tenants/${selectedTenant}/report-template-activations/${activation.id}`,
        { method: 'DELETE' },
      );
      await fetchActivations();
    } catch (error) {
      console.error('Error deactivating template for tenant:', error);
    }
  };

  const isActivatedForTenant = (templateId: string): boolean => {
    return activations.some((a) => a.report_template_id === templateId);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Templates de Reporte</h1>
          <p className="text-sm text-gray-500 mt-1">
            Definir estructura de PDF por tenant y tipo de formulario
          </p>
        </div>
        <Link
          href={(() => {
            const params = new URLSearchParams();
            if (selectedTenant) params.set('tenant_slug', selectedTenant);
            if (filterFormType) {
              params.set('tenant_form_id', filterFormType);
              const form = tenantForms.find((f) => f.id === filterFormType);
              if (form) {
                params.set('form_type', form.form_type);
                params.set('form_name', form.name);
              }
            }
            const qs = params.toString();
            return `/platform/report-templates/nuevo${qs ? `?${qs}` : ''}`;
          })()}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          Nuevo Template
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-4 items-end">
        <div className="flex-1 max-w-xs">
          <label className="block text-xs font-medium text-gray-600 mb-1">Tenant</label>
          <select
            value={selectedTenant}
            onChange={(e) => setSelectedTenant(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Seleccionar tenant"
          >
            <option value="">Seleccionar tenant...</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.slug}>
                {t.nombre} ({t.slug})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Tipo formulario</label>
          <select
            value={filterFormType}
            onChange={(e) => setFilterFormType(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm"
            aria-label="Filtrar por formulario"
          >
            <option value="">Todos los formularios</option>
            {tenantForms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Info banner when tenant is selected */}
      {selectedTenant && (
        <div className="bg-blue-50 border border-blue-200 rounded-md px-4 py-2 text-sm text-blue-800">
          Gestionando templates para <strong>{tenants.find((t) => t.slug === selectedTenant)?.nombre || selectedTenant}</strong>.
          Usa el toggle "Asignado" para activar/desactivar templates en este tenant.
        </div>
      )}

      {/* Notification toast */}
      {notification && (
        <div className={`flex items-center justify-between rounded-md px-4 py-3 text-sm animate-in fade-in ${
          notification.type === 'error'
            ? 'bg-red-50 border border-red-200 text-red-800'
            : 'bg-green-50 border border-green-200 text-green-800'
        }`}>
          <div className="flex items-center gap-2">
            <span>{notification.type === 'error' ? '⚠️' : '✅'}</span>
            <span>{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-gray-400 hover:text-gray-600 ml-4"
          >
            ✕
          </button>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-center py-8 text-gray-500">Cargando...</div>
      ) : (
        <ReportTemplatesDataTable
          templates={templates}
          selectedTenant={selectedTenant}
          tenantForms={tenantForms}
          activations={activations}
          filterFormType={filterFormType}
          isActivatedForTenant={isActivatedForTenant}
          onToggle={handleToggle}
          onActivate={handleActivateForTenant}
          onDeactivate={handleDeactivateForTenant}
          onDelete={handleDelete}
          onTheme={(t) => {
            const activation = activations.find((a) => a.report_template_id === t.id);
            if (activation) {
              const mf = tenantForms.find((f) => f.form_type === t.formType);
              setThemeTarget({ activationId: activation.id, themeConfig: activation.theme_config || null, formId: filterFormType || mf?.id || undefined });
            }
          }}
        />
      )}

      {!selectedTenant && (
        <div className="text-center py-6 text-gray-400 text-sm border border-dashed border-gray-300 rounded-lg">
          Selecciona un tenant para gestionar la asignación de templates
        </div>
      )}

      {/* Theme Panel Modal */}
      {themeTarget && selectedTenant && (
        <ThemePanel
          tenantSlug={selectedTenant}
          activationId={themeTarget.activationId}
          formId={themeTarget.formId}
          currentThemeConfig={themeTarget.themeConfig}
          onSave={() => {
            setThemeTarget(null);
            fetchActivations();
          }}
          onClose={() => setThemeTarget(null)}
        />
      )}
    </div>
  );
}

// ─── DataTable sub-component ─────────────────────────────────────────────────

const rtColumnHelper = createColumnHelper<ReportTemplate>();

function ReportTemplatesDataTable({
  templates,
  selectedTenant,
  tenantForms,
  activations,
  filterFormType,
  isActivatedForTenant,
  onToggle,
  onActivate,
  onDeactivate,
  onDelete,
  onTheme,
}: {
  templates: ReportTemplate[];
  selectedTenant: string;
  tenantForms: Array<{ id: string; form_type: string; name: string }>;
  activations: Activation[];
  filterFormType: string;
  isActivatedForTenant: (id: string) => boolean;
  onToggle: (id: string) => void;
  onActivate: (id: string) => void;
  onDeactivate: (id: string) => void;
  onDelete: (id: string, name: string) => void;
  onTheme: (t: ReportTemplate) => void;
}) {
  const columns = useMemo(() => {
    const cols: any[] = [
      rtColumnHelper.accessor('formType', {
        header: 'Tipo',
        cell: (info) => (
          <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-indigo-100 text-indigo-800">
            {info.getValue() || 'Sin tipo'}
          </span>
        ),
      }),
      rtColumnHelper.accessor('name', {
        header: 'Nombre',
        cell: (info) => {
          const t = info.row.original;
          return (
            <div>
              <div className="font-medium text-gray-900">{info.getValue()}</div>
              {t.description && <div className="text-xs text-gray-500">{t.description}</div>}
            </div>
          );
        },
      }),
    ];

    if (selectedTenant) {
      cols.push(
        rtColumnHelper.display({
          id: 'formulario',
          header: 'Formulario',
          enableColumnFilter: false,
          cell: (info) => {
            const t = info.row.original;
            const mf = t.tenantFormId
              ? tenantForms.find((f) => f.id === t.tenantFormId)
              : tenantForms.find((f) => f.form_type === t.formType);
            return mf
              ? <span className="text-sm text-gray-800">{mf.name}</span>
              : <span className="text-xs text-gray-400 italic">Sin formulario</span>;
          },
        }),
      );
    }

    cols.push(
      rtColumnHelper.accessor('isActive', {
        header: 'Estado',
        filterFn: (row, _columnId, filterValue) => {
          const label = row.original.isActive ? 'activo' : 'inactivo';
          return label.startsWith(filterValue.toLowerCase());
        },
        cell: (info) => {
          const t = info.row.original;
          return (
            <button
              onClick={() => onToggle(t.id)}
              className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full cursor-pointer transition-colors ${
                t.isActive ? 'bg-green-100 text-green-800 hover:bg-green-200' : 'bg-red-100 text-red-800 hover:bg-red-200'
              }`}
            >
              {t.isActive ? 'Activo' : 'Inactivo'}
            </button>
          );
        },
      }),
    );

    if (selectedTenant) {
      cols.push(
        rtColumnHelper.display({
          id: 'asignado',
          header: 'Asignado',
          enableColumnFilter: false,
          enableSorting: false,
          cell: (info) => {
            const t = info.row.original;
            const activated = isActivatedForTenant(t.id);
            return (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => activated ? onDeactivate(t.id) : onActivate(t.id)}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full cursor-pointer transition-colors ${
                    activated ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {activated ? '✅ Asignado' : '⚪ Sin asignar'}
                </button>
                {activated && (
                  <button
                    onClick={() => onTheme(t)}
                    className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-700 hover:bg-purple-200 cursor-pointer"
                    title="Configurar tema visual"
                  >
                    🎨 Tema
                  </button>
                )}
              </div>
            );
          },
        }),
      );
    }

    cols.push(
      rtColumnHelper.display({
        id: 'acciones',
        header: 'Acciones',
        enableSorting: false,
        enableColumnFilter: false,
        cell: (info) => {
          const t = info.row.original;
          return (
            <div className="space-x-2">
              <Link href={`/platform/report-templates/${t.id}`} className="text-blue-600 hover:text-blue-800">Editar</Link>
              <button onClick={() => onDelete(t.id, t.name)} className="text-red-600 hover:text-red-800">Eliminar</button>
            </div>
          );
        },
      }),
    );

    return cols;
  }, [selectedTenant, tenantForms, activations, isActivatedForTenant, onToggle, onActivate, onDeactivate, onDelete, onTheme]);

  return <DataTable data={templates} columns={columns} columnFiltering globalFilter={false} />;
}
