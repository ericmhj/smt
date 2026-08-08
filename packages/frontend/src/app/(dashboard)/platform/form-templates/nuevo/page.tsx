'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';

export default function NuevoFormTemplatePage() {
  const router = useRouter();
  const [formType, setFormType] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [htmlContent, setHtmlContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      await api('/api/form-templates', {
        method: 'POST',
        body: JSON.stringify({
          form_type: formType,
          name,
          description: description || undefined,
          html_content: htmlContent,
        }),
      });
      router.push('/platform/form-templates');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError(`Ya existe un template con form_type "${formType}"`);
      } else {
        setError(err instanceof Error ? err.message : 'Error al crear template');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Nuevo Formulario Padre</h1>
        <p className="text-sm text-gray-500 mt-1">Crear un nuevo template de formulario para tenants</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-md">{error}</div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Tipo de formulario (form_type)
          </label>
          <input
            type="text"
            value={formType}
            onChange={(e) => setFormType(e.target.value)}
            required
            placeholder="ej: nom025, nom035, custom"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-500 mt-1">Identificador único del tipo. No se puede cambiar después.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="ej: NOM-025 Iluminación"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Descripción (opcional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Descripción del template"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">HTML del formulario</label>
          <textarea
            value={htmlContent}
            onChange={(e) => setHtmlContent(e.target.value)}
            required
            rows={15}
            placeholder="Pegue aquí el HTML completo del formulario..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
          />
          <p className="text-xs text-gray-500 mt-1">
            Incluya secciones con class=&quot;section-heading&quot; o data-section=&quot;nombre&quot; y campos con atributo name.
          </p>
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm"
          >
            {submitting ? 'Creando...' : 'Crear Template'}
          </button>
          <Link
            href="/platform/form-templates"
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm"
          >
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
