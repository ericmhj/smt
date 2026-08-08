'use client';

import { useState, useEffect } from 'react';
import { api, ApiError } from '@/lib/api';

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
}

interface FormTemplate {
  id: string;
  formType: string;
  name: string;
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

  // Load tenants and templates
  useEffect(() => {
    api<{ data: Tenant[] }>('/api/platform/tenants?limit=100')
      .then((res) => setTenants(res.data || []))
      .catch(() => {});
    api<FormTemplate[]>('/api/form-templates/all')
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
      {selectedTenant && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nombre</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Template</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reporte Asignado</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Versión</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loadingForms ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">Cargando...</td></tr>
              ) : forms.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">Sin formularios en este tenant.</td></tr>
              ) : (
                forms.map((f) => {
                  const reportName = getReportTemplateName(f);
                  return (
                    <tr key={f.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{f.name}</td>
                      <td className="px-4 py-3">
                        {f.template_id ? (
                          <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-800">
                            {f.form_type}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">Manual</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {reportName ? (
                          <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-100 text-emerald-800">
                            📄 {reportName}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">Sin reporte</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">v{f.current_version}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                          f.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {f.is_active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
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
                  {templates.map((t) => (
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
    </div>
  );
}
