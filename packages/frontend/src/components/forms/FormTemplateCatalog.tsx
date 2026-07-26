'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import HTMLEditor from './HTMLEditor';

interface FormTemplate {
  id: string;
  name: string;
  formType: string;
  description?: string;
  isActive: boolean;
}

interface StructuralValidationError {
  missingFields: string[];
  missingSections: string[];
}

export default function FormTemplateCatalog() {
  const router = useRouter();
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modal state
  const [selectedTemplate, setSelectedTemplate] = useState<FormTemplate | null>(null);
  const [formName, setFormName] = useState('');
  const [htmlContent, setHtmlContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [structuralError, setStructuralError] = useState<StructuralValidationError | null>(null);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const response = await api<{ data: FormTemplate[] }>('/api/form-templates');
      setTemplates(response.data || []);
    } catch {
      setError('Error al cargar el catálogo de templates');
    } finally {
      setLoading(false);
    }
  };

  const openModal = (template: FormTemplate) => {
    setSelectedTemplate(template);
    setFormName('');
    setHtmlContent('');
    setStructuralError(null);
    setSubmitError('');
  };

  const closeModal = () => {
    setSelectedTemplate(null);
    setFormName('');
    setHtmlContent('');
    setStructuralError(null);
    setSubmitError('');
  };

  const handleCreateFromTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTemplate) return;

    setSubmitting(true);
    setStructuralError(null);
    setSubmitError('');

    try {
      await api('/api/forms/from-template', {
        method: 'POST',
        body: JSON.stringify({
          templateId: selectedTemplate.id,
          html: htmlContent,
          name: formName,
        }),
      });
      router.push('/forms');
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && err.data?.error === 'STRUCTURAL_VALIDATION_FAILED') {
        setStructuralError({
          missingFields: (err.data.missingFields as string[]) || [],
          missingSections: (err.data.missingSections as string[]) || [],
        });
      } else {
        setSubmitError(err instanceof Error ? err.message : 'Error al crear formulario');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <p className="text-gray-500">Cargando catálogo de templates...</p>;
  }

  if (error) {
    return <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md">{error}</div>;
  }

  return (
    <>
      {templates.length === 0 ? (
        <p className="text-center text-gray-500 py-8">No hay templates disponibles.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template) => (
            <div
              key={template.id}
              className="bg-white rounded-lg shadow p-4 border border-gray-200 flex flex-col"
            >
              <h3 className="text-lg font-semibold text-gray-800">{template.name}</h3>
              <span className="inline-block mt-1 px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-800 w-fit">
                {template.formType}
              </span>
              {template.description && (
                <p className="text-sm text-gray-500 mt-2 flex-1">{template.description}</p>
              )}
              <button
                onClick={() => openModal(template)}
                className="mt-4 w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
              >
                Usar este template
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Modal for creating form from template */}
      {selectedTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-800">
                Crear formulario desde &quot;{selectedTemplate.name}&quot;
              </h2>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCreateFromTemplate} className="space-y-4">
              {submitError && (
                <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md">{submitError}</div>
              )}

              {structuralError && (
                <div className="bg-red-50 border border-red-200 rounded-md p-4">
                  <p className="text-red-700 font-medium text-sm mb-2">
                    El formulario no cumple con la estructura del template padre
                  </p>
                  {structuralError.missingFields.length > 0 && (
                    <div className="mb-2">
                      <p className="text-red-600 text-xs font-medium">Campos faltantes:</p>
                      <ul className="list-disc list-inside text-red-600 text-xs mt-1">
                        {structuralError.missingFields.map((field) => (
                          <li key={field}>{field}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {structuralError.missingSections.length > 0 && (
                    <div>
                      <p className="text-red-600 text-xs font-medium">Secciones faltantes:</p>
                      <ul className="list-disc list-inside text-red-600 text-xs mt-1">
                        {structuralError.missingSections.map((section) => (
                          <li key={section}>{section}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre del formulario
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  required
                  placeholder="Ej: NOM-025 Planta Norte"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <HTMLEditor value={htmlContent} onChange={setHtmlContent} />

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? 'Creando...' : 'Crear formulario'}
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
