'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';

interface Activation {
  id: string;
  report_template_id: string;
  activated_by: string;
  activated_at: string;
}

interface Override {
  id: string;
  form_id: string;
  report_template_id: string;
  override_type: 'deactivate' | 'custom';
  custom_sections: unknown[] | null;
  created_at: string;
}

interface ReportTemplate {
  id: string;
  formType: string | null;
  name: string;
  isActive: boolean;
  sections: Array<{ id: string; title: string; type: string; is_active: boolean; order: number }>;
}

export default function ReportTemplateTenantPage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const formId = params.formId as string;

  const [template, setTemplate] = useState<ReportTemplate | null>(null);
  const [activations, setActivations] = useState<Activation[]>([]);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [loading, setLoading] = useState(true);

  // Guard: only admin/superusuario
  useEffect(() => {
    if (user && user.role !== 'admin' && user.role !== 'superusuario') {
      router.replace('/kanban');
    }
  }, [user, router]);

  // Load data
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        // Get form to know its form_type
        const form = await api<{ formType: string }>(`/api/forms/${formId}`);

        // Get available templates for this form_type
        if (form.formType) {
          const templates = await api<ReportTemplate[]>(
            `/api/report-templates?form_type=${form.formType}`,
          );
          const active = templates.find((t) => t.isActive);
          setTemplate(active || null);
        }

        // Get activations
        const acts = await api<Activation[]>('/api/report-template-activations');
        setActivations(acts);

        // Get overrides for this form
        const ovs = await api<Override[]>(`/api/forms/${formId}/report-overrides`);
        setOverrides(ovs);
      } catch (error) {
        console.error('Error loading template config:', error);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [formId]);

  const isActivated = template
    ? activations.some((a) => a.report_template_id === template.id)
    : false;

  const currentOverride = template
    ? overrides.find((o) => o.report_template_id === template.id)
    : null;

  const handleActivate = async () => {
    if (!template) return;
    try {
      await api('/api/report-template-activations', {
        method: 'POST',
        body: JSON.stringify({ report_template_id: template.id }),
      });
      const acts = await api<Activation[]>('/api/report-template-activations');
      setActivations(acts);
    } catch (error) {
      console.error('Error activating template:', error);
    }
  };

  const handleDeactivate = async () => {
    const activation = activations.find((a) => a.report_template_id === template?.id);
    if (!activation) return;
    try {
      await api(`/api/report-template-activations/${activation.id}`, { method: 'DELETE' });
      const acts = await api<Activation[]>('/api/report-template-activations');
      setActivations(acts);
    } catch (error) {
      console.error('Error deactivating template:', error);
    }
  };

  const handleOverrideDeactivate = async () => {
    if (!template) return;
    try {
      await api(`/api/forms/${formId}/report-overrides`, {
        method: 'POST',
        body: JSON.stringify({
          report_template_id: template.id,
          override_type: 'deactivate',
        }),
      });
      const ovs = await api<Override[]>(`/api/forms/${formId}/report-overrides`);
      setOverrides(ovs);
    } catch (error) {
      console.error('Error creating override:', error);
    }
  };

  const handleRemoveOverride = async () => {
    if (!currentOverride) return;
    try {
      await api(`/api/forms/${formId}/report-overrides/${currentOverride.id}`, {
        method: 'DELETE',
      });
      const ovs = await api<Override[]>(`/api/forms/${formId}/report-overrides`);
      setOverrides(ovs);
    } catch (error) {
      console.error('Error removing override:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="text-gray-500">Cargando configuración de template...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Template de Reporte</h1>
        <p className="text-sm text-gray-500 mt-1">
          Configuración del template de PDF para este formulario
        </p>
      </div>

      {/* Status Card */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">Estado actual</h2>

        {!template ? (
          <div className="text-sm text-gray-500 bg-gray-50 rounded p-3">
            No existe un template de reporte activo para el tipo de formulario de este formulario.
            Los PDFs se generarán con el formato legacy.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between bg-blue-50 rounded p-3">
              <div>
                <span className="text-sm font-medium text-blue-900">{template.name}</span>
                <span className="ml-2 text-xs text-blue-600">
                  ({template.sections.filter((s) => s.is_active).length} secciones activas)
                </span>
              </div>
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                Disponible
              </span>
            </div>

            {/* Activation Status */}
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm text-gray-700">
                  {isActivated ? '✅ Template activado para tu organización' : '⚪ Template no activado'}
                </span>
                {!isActivated && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    Se usa el formato legacy hasta que actives el template
                  </p>
                )}
              </div>
              {isActivated ? (
                <button
                  onClick={handleDeactivate}
                  className="px-3 py-1.5 text-xs border border-red-200 text-red-700 rounded hover:bg-red-50"
                >
                  Desactivar
                </button>
              ) : (
                <button
                  onClick={handleActivate}
                  className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Activar Template
                </button>
              )}
            </div>

            {/* Override Status */}
            {isActivated && (
              <div className="border-t pt-3">
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">
                  Override para este formulario
                </h3>
                {currentOverride ? (
                  <div className="flex items-center justify-between bg-yellow-50 rounded p-3">
                    <span className="text-sm text-yellow-800">
                      {currentOverride.override_type === 'deactivate'
                        ? '🚫 Template desactivado para este formulario'
                        : '🔧 Secciones personalizadas'}
                    </span>
                    <button
                      onClick={handleRemoveOverride}
                      className="px-3 py-1.5 text-xs border border-gray-200 rounded hover:bg-gray-50"
                    >
                      Quitar Override
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={handleOverrideDeactivate}
                      className="px-3 py-1.5 text-xs border border-gray-200 rounded hover:bg-gray-50"
                    >
                      Desactivar para este formulario
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
