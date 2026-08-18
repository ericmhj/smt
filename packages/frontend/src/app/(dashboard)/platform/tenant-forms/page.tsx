'use client';

import { useState, useEffect, useMemo } from 'react';
import { api, ApiError } from '@/lib/api';
import { createColumnHelper } from '@tanstack/react-table';
import DataTable from '@/components/ui/DataTable';

interface Tenant {
  id: string;
  slug: string;
  nombre: string;
}

interface TenantForm {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  current_version: number;
  template_id: string | null;
  form_type: string | null;
  created_at: string;
  updated_at: string;
}

interface FormTemplate {
  id: string;
  formType: string;
  name: string;
  isActive?: boolean;
}

interface ReportTemplate {
  id: string;
  formType: string | null;
  name: string;
  tenantSlug: string | null;
  tenantFormId: string | null;
  isActive: boolean;
}

interface Activation {
  id: string;
  report_template_id: string;
}

interface StructuralError {
  missingFields: string[];
  missingSections: string[];
}

export default function TenantFormsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenant, setSelectedTenant] = useState('');
  const [forms, setForms] = useState<TenantForm[]>([]);
  const [loadingForms, setLoadingForms] = useState(false);
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [reportTemplates, setReportTemplates] = useState<ReportTemplate[]>([]);
  const [activations, setActivations] = useState<Activation[]>([]);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [modalTemplate, setModalTemplate] = useState('');
  const [modalName, setModalName] = useState('');
  const [modalHtml, setModalHtml] = useState('');
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');
  const [structuralError, setStructuralError] = useState<StructuralError | null>(null);

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState<TenantForm | null>(null);
  const [editName, setEditName] = useState('');
  const [editHtml, setEditHtml] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState('');
  const [editSuccess, setEditSuccess] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  // Preview modal state
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewForm, setPreviewForm] = useState<TenantForm | null>(null);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);

  // Load tenants and templates
  useEffect(() => {
    api<{ data: Tenant[] }>('/api/platform/tenants?limit=100')
      .then((res) => setTenants(res.data || []))
      .catch(() => {});
    api<FormTemplate[]>('/api/form-templates')
      .then(setTemplates)
      .catch(() => {});
    api<ReportTemplate[]>('/api/report-templates')
      .then(setReportTemplates)
      .catch(() => {});
  }, []);

  // Load forms and activations when tenant changes
  useEffect(() => {
    if (!selectedTenant) {
      setForms([]);
      setActivations([]);
      return;
    }
    setLoadingForms(true);
    Promise.all([
      api<TenantForm[]>(`/api/platform/tenants/${selectedTenant}/forms`),
      api<Activation[]>(`/api/platform/tenants/${selectedTenant}/report-template-activations`).catch(() => []),
    ])
      .then(([formsData, activationsData]) => {
        setForms(formsData);
        setActivations(activationsData);
      })
      .catch(() => {
        setForms([]);
        setActivations([]);
      })
      .finally(() => setLoadingForms(false));
  }, [selectedTenant]);

  /** Find the report template name assigned to a form */
  const getReportTemplateName = (form: TenantForm): string | null => {
    // 1. Check if there's a report template directly linked to this form (by tenant_form_id)
    const directTemplate = reportTemplates.find(
      (rt) => rt.tenantFormId === form.id && rt.isActive,
    );
    if (directTemplate) {
      const isActivated = activations.some((a) => a.report_template_id === directTemplate.id);
      return isActivated ? directTemplate.name : null;
    }

    // 2. Check by form_type match + activation
    if (form.form_type) {
      const typeTemplate = reportTemplates.find(
        (rt) => rt.formType === form.form_type && rt.isActive && !rt.tenantFormId,
      );
      if (typeTemplate) {
        const isActivated = activations.some((a) => a.report_template_id === typeTemplate.id);
        return isActivated ? typeTemplate.name : null;
      }
    }

    return null;
  };

  const openModal = () => {
    setShowModal(true);
    setModalTemplate('');
    setModalName('');
    setModalHtml('');
    setModalError('');
    setStructuralError(null);
  };

  const openEditModal = async (form: TenantForm) => {
    setEditForm(form);
    setEditName(form.name);
    setEditHtml('');
    setEditError('');
    setEditSuccess('');
    setEditLoading(true);
    setShowEditModal(true);

    // Load HTML from parent template
    if (form.template_id) {
      try {
        const template = await api<{ htmlContent: string }>(`/api/form-templates/${form.template_id}`);
        if (template?.htmlContent) {
          setEditHtml(template.htmlContent);
        }
      } catch {
        setEditError('No se pudo cargar el HTML del template padre');
      }
    } else {
      setEditError('Este formulario no tiene un template padre asociado');
    }
    setEditLoading(false);
  };

  const openPreviewModal = async (form: TenantForm) => {
    setPreviewForm(form);
    setPreviewHtml('');
    setPreviewLoading(true);
    setShowPreviewModal(true);

    if (form.template_id) {
      try {
        const template = await api<{ htmlContent: string }>(`/api/form-templates/${form.template_id}`);
        setPreviewHtml(template?.htmlContent || '<p>Sin contenido HTML</p>');
      } catch {
        setPreviewHtml('<p class="text-red-500">Error al cargar la vista previa</p>');
      }
    } else {
      setPreviewHtml('<p class="text-gray-500">Este formulario no tiene template asociado</p>');
    }
    setPreviewLoading(false);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editForm) return;
    setEditError('');
    setEditSuccess('');
    setEditSubmitting(true);

    try {
      // Update tenant form directly via PUT /api/forms/:id with tenant context
      await api(`/api/forms/${editForm.id}`, {
        method: 'PUT',
        headers: { 'X-Tenant-Slug': selectedTenant },
        body: JSON.stringify({
          html: editHtml,
          newName: editName !== editForm.name ? editName : undefined,
        }),
      });
      setEditSuccess('Formulario del tenant actualizado correctamente.');
      // Refresh forms list
      const data = await api<TenantForm[]>(`/api/platform/tenants/${selectedTenant}/forms`);
      setForms(data);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Error al actualizar');
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleDeleteForm = async (form: TenantForm) => {
    if (!confirm(`¿Eliminar el formulario "${form.name}"? Esta acción no se puede deshacer.`)) return;
    try {
      await api('/api/platform/delete-tenant-form', {
        method: 'POST',
        body: JSON.stringify({ tenantSlug: selectedTenant, formId: form.id }),
      });
      const data = await api<TenantForm[]>(`/api/platform/tenants/${selectedTenant}/forms`);
      setForms(data);
    } catch (err) {
      if (err instanceof ApiError && err.data?.code === 'HAS_RELATIONS') {
        alert(err.data.message as string);
      } else {
        alert(err instanceof Error ? err.message : 'Error al eliminar');
      }
    }
  };

  const handleToggleForm = async (form: TenantForm) => {
    try {
      await api('/api/platform/toggle-tenant-form', {
        method: 'POST',
        body: JSON.stringify({ tenantSlug: selectedTenant, formId: form.id, isActive: !form.is_active }),
      });
      const data = await api<TenantForm[]>(`/api/platform/tenants/${selectedTenant}/forms`);
      setForms(data);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al cambiar estado');
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');
    setStructuralError(null);
    setModalSubmitting(true);

    try {
      await api(`/api/platform/tenants/${selectedTenant}/forms/from-template`, {
        method: 'POST',
        body: JSON.stringify({
          templateId: modalTemplate,
          name: modalName,
          html: modalHtml,
        }),
      });
      setShowModal(false);
      // Refresh forms
      const data = await api<TenantForm[]>(`/api/platform/tenants/${selectedTenant}/forms`);
      setForms(data);
    } catch (err) {
      if (err instanceof ApiError && err.data?.error === 'STRUCTURAL_VALIDATION_FAILED') {
        setStructuralError({
          missingFields: (err.data.missingFields as string[]) || [],
          missingSections: (err.data.missingSections as string[]) || [],
        });
      } else {
        setModalError(err instanceof Error ? err.message : 'Error al crear formulario');
      }
    } finally {
      setModalSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Formularios por Tenant</h1>
          <p className="text-sm text-gray-500 mt-1">Asignar templates de formulario a tenants específicos</p>
        </div>
      </div>

      {/* Tenant selector */}
      <div className="flex gap-4 items-end">
        <div className="flex-1 max-w-sm">
          <label className="block text-sm font-medium text-gray-700 mb-1">Tenant</label>
          <select
            value={selectedTenant}
            onChange={(e) => setSelectedTenant(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Seleccionar tenant...</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.slug}>{t.nombre} ({t.slug})</option>
            ))}
          </select>
        </div>
        {selectedTenant && (
          <button
            onClick={openModal}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
          >
            Asignar Template
          </button>
        )}
      </div>

      {/* Forms table */}
      {selectedTenant && !loadingForms && (
        <FormsDataTable
          forms={forms}
          getReportTemplateName={getReportTemplateName}
          onToggle={handleToggleForm}
          onPreview={openPreviewModal}
          onEdit={openEditModal}
          onDelete={handleDeleteForm}
        />
      )}
      {selectedTenant && loadingForms && (
        <div className="text-center py-8 text-gray-500">Cargando...</div>
      )}

      {!selectedTenant && (
        <div className="text-center py-12 text-gray-400 text-sm border border-dashed border-gray-300 rounded-lg">
          Selecciona un tenant para ver y gestionar sus formularios
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-800">Asignar Template a "{selectedTenant}"</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl font-bold">×</button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              {modalError && (
                <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md">{modalError}</div>
              )}

              {structuralError && (
                <div className="bg-red-50 border border-red-200 rounded-md p-4">
                  <p className="text-red-700 font-medium text-sm mb-2">El formulario no cumple con la estructura del template</p>
                  {structuralError.missingFields.length > 0 && (
                    <div className="mb-2">
                      <p className="text-red-600 text-xs font-medium">Campos faltantes:</p>
                      <ul className="list-disc list-inside text-red-600 text-xs mt-1">
                        {structuralError.missingFields.map((f) => <li key={f}>{f}</li>)}
                      </ul>
                    </div>
                  )}
                  {structuralError.missingSections.length > 0 && (
                    <div>
                      <p className="text-red-600 text-xs font-medium">Secciones faltantes:</p>
                      <ul className="list-disc list-inside text-red-600 text-xs mt-1">
                        {structuralError.missingSections.map((s) => <li key={s}>{s}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Template</label>
                <select
                  value={modalTemplate}
                  onChange={async (e) => {
                    const selectedId = e.target.value;
                    setModalTemplate(selectedId);
                    // Auto-load HTML from selected template
                    if (selectedId) {
                      try {
                        const tmpl = await api<{ htmlContent: string; name: string }>(`/api/form-templates/${selectedId}`);
                        if (tmpl.htmlContent) {
                          setModalHtml(tmpl.htmlContent);
                        }
                        if (!modalName && tmpl.name) {
                          setModalName(tmpl.name);
                        }
                      } catch {
                        // ignore — user can still type manually
                      }
                    } else {
                      setModalHtml('');
                    }
                  }}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Seleccionar template...</option>
                  {templates.filter(t => t.isActive !== false).map((t) => (
                    <option key={t.id} value={t.id}>{t.formType} — {t.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del formulario</label>
                <input
                  type="text"
                  value={modalName}
                  onChange={(e) => setModalName(e.target.value)}
                  required
                  placeholder="ej: Evaluación Iluminación Planta Norte"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">HTML del formulario</label>
                <textarea
                  value={modalHtml}
                  onChange={(e) => setModalHtml(e.target.value)}
                  required
                  rows={10}
                  placeholder="HTML con la misma estructura de secciones y campos del template..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">Debe contener las mismas secciones y campos del template padre.</p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={modalSubmitting}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm"
                >
                  {modalSubmitting ? 'Creando...' : 'Crear Formulario'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Edit Modal */}
      {showEditModal && editForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-800">Editar Formulario</h2>
                <p className="text-xs text-gray-500 mt-1">
                  Tenant: <span className="font-medium">{selectedTenant}</span> · 
                  Tipo: <span className="font-mono text-purple-600">{editForm.form_type || 'N/A'}</span> · 
                  Versión actual: v{editForm.current_version}
                </p>
              </div>
              <button onClick={() => setShowEditModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl font-bold">×</button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              {editError && (
                <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md">{editError}</div>
              )}
              {editSuccess && (
                <div className="bg-green-50 text-green-700 text-sm p-3 rounded-md">{editSuccess}</div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del formulario</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">HTML del formulario</label>
                {editLoading ? (
                  <div className="text-gray-500 text-sm py-4 text-center">Cargando contenido...</div>
                ) : (
                  <textarea
                    value={editHtml}
                    onChange={(e) => setEditHtml(e.target.value)}
                    required
                    rows={15}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  />
                )}
                <p className="text-xs text-gray-500 mt-1">Se validará la estructura contra el template padre al guardar.</p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={editSubmitting || editLoading || !editHtml}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
                >
                  {editSubmitting ? 'Actualizando...' : 'Guardar Cambios'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Preview Modal */}
      {showPreviewModal && previewForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">{previewForm.name}</h2>
                <p className="text-xs text-gray-500">
                  Tenant: {selectedTenant} · Tipo: {previewForm.form_type || 'N/A'} · v{previewForm.current_version} · Solo lectura
                </p>
              </div>
              <button
                onClick={() => { setShowPreviewModal(false); setPreviewHtml(''); }}
                className="text-gray-400 hover:text-gray-600 text-xl font-bold"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {previewLoading ? (
                <div className="text-center text-gray-500 py-12">Cargando vista previa...</div>
              ) : (
                <div
                  className="prose prose-sm max-w-none pointer-events-none select-none opacity-90
                    [&_input]:border [&_input]:border-gray-300 [&_input]:rounded [&_input]:px-2 [&_input]:py-1 [&_input]:w-full [&_input]:mb-3 [&_input]:bg-gray-50
                    [&_select]:border [&_select]:border-gray-300 [&_select]:rounded [&_select]:px-2 [&_select]:py-1 [&_select]:w-full [&_select]:mb-3 [&_select]:bg-gray-50
                    [&_textarea]:border [&_textarea]:border-gray-300 [&_textarea]:rounded [&_textarea]:px-2 [&_textarea]:py-1 [&_textarea]:w-full [&_textarea]:mb-3 [&_textarea]:bg-gray-50
                    [&_label]:font-medium [&_label]:text-gray-700 [&_label]:block [&_label]:mb-1
                    [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-gray-300 [&_td]:px-2 [&_td]:py-1
                    [&_th]:border [&_th]:border-gray-300 [&_th]:px-2 [&_th]:py-1 [&_th]:bg-gray-50"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              )}
            </div>
            <div className="flex items-center justify-end px-6 py-3 border-t">
              <button
                onClick={() => { setShowPreviewModal(false); setPreviewHtml(''); }}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── DataTable sub-component ─────────────────────────────────────────────────

const columnHelper = createColumnHelper<TenantForm>();

function FormsDataTable({
  forms,
  getReportTemplateName,
  onToggle,
  onPreview,
  onEdit,
  onDelete,
}: {
  forms: TenantForm[];
  getReportTemplateName: (f: TenantForm) => string | null;
  onToggle: (f: TenantForm) => void;
  onPreview: (f: TenantForm) => void;
  onEdit: (f: TenantForm) => void;
  onDelete: (f: TenantForm) => void;
}) {
  const columns = useMemo(() => [
    columnHelper.accessor('name', {
      header: 'Nombre',
      cell: (info) => <span className="font-medium text-gray-900">{info.getValue()}</span>,
    }),
    columnHelper.accessor('form_type', {
      header: 'Template',
      cell: (info) => {
        const row = info.row.original;
        return row.template_id ? (
          <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-800">
            {info.getValue()}
          </span>
        ) : (
          <span className="text-xs text-gray-400">Manual</span>
        );
      },
    }),
    columnHelper.display({
      id: 'reporte',
      header: 'Reporte Asignado',
      cell: (info) => {
        const reportName = getReportTemplateName(info.row.original);
        return reportName ? (
          <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-100 text-emerald-800">
            📄 {reportName}
          </span>
        ) : (
          <span className="text-xs text-gray-400">Sin reporte</span>
        );
      },
    }),
    columnHelper.accessor('current_version', {
      header: 'Versión',
      cell: (info) => <span className="text-gray-500">v{info.getValue()}</span>,
    }),
    columnHelper.accessor('updated_at', {
      header: 'Última modificación',
      filterFn: (row, _columnId, filterValue) => {
        const dateStr = row.original.updated_at || row.original.created_at;
        if (!dateStr) return false;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return false;
        const formatted = d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        return formatted.toLowerCase().includes(filterValue.toLowerCase());
      },
      cell: (info) => {
        const dateStr = info.getValue() || info.row.original.created_at;
        if (!dateStr) return '—';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '—';
        return <span className="text-gray-500">{d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>;
      },
    }),
    columnHelper.accessor('is_active', {
      header: 'Estado',
      filterFn: (row, _columnId, filterValue) => {
        const label = row.original.is_active ? 'activo' : 'inactivo';
        return label.startsWith(filterValue.toLowerCase());
      },
      cell: (info) => {
        const row = info.row.original;
        return (
          <button
            onClick={() => onToggle(row)}
            className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full cursor-pointer transition-colors ${
              row.is_active ? 'bg-green-100 text-green-800 hover:bg-green-200' : 'bg-red-100 text-red-800 hover:bg-red-200'
            }`}
          >
            {row.is_active ? 'Activo' : 'Inactivo'}
          </button>
        );
      },
    }),
    columnHelper.display({
      id: 'acciones',
      header: 'Acciones',
      enableSorting: false,
      enableColumnFilter: false,
      cell: (info) => {
        const row = info.row.original;
        return (
          <div className="space-x-3">
            <button onClick={() => onPreview(row)} className="text-gray-600 hover:text-gray-800">Vista previa</button>
            <button onClick={() => onEdit(row)} className="text-blue-600 hover:text-blue-800 font-medium">Editar</button>
            <button onClick={() => onDelete(row)} className="text-red-600 hover:text-red-800">Eliminar</button>
          </div>
        );
      },
    }),
  ], [getReportTemplateName, onToggle, onPreview, onEdit, onDelete]);

  return <DataTable data={forms} columns={columns} columnFiltering globalFilter={false} />;
}
