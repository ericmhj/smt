'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

interface FormTemplate {
  id: string;
  formType: string;
  name: string;
  description: string | null;
  htmlContent: string;
  currentVersion: number;
  isActive: boolean;
}

export default function EditarFormTemplatePage() {
  const params = useParams();
  const router = useRouter();
  const [template, setTemplate] = useState<FormTemplate | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [htmlContent, setHtmlContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchTemplate = async () => {
      try {
        const data = await api<FormTemplate>(`/api/form-templates/${params.id}`);
        setTemplate(data);
        setName(data.name);
        setDescription(data.description || '');
        setHtmlContent(data.htmlContent);
      } catch {
        setError('Template no encontrado');
      } finally {
        setLoading(false);
      }
    };
    fetchTemplate();
  }, [params.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      await api(`/api/form-templates/${params.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name,
          description: description || undefined,
          html_content: htmlContent,
        }),
      });
      router.push('/platform/form-templates');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar template');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="text-gray-500">Cargando template...</div>;
  }

  if (!template) {
    return <div className="text-red-600">Template no encontrado</div>;
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Editar Formulario Padre</h1>
        <p className="text-sm text-gray-500 mt-1">
          Tipo: <span className="font-mono text-blue-600">{template.formType}</span> · 
          Versión actual: v{template.currentVersion} → Al guardar se creará v{template.currentVersion + 1}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-md">{error}</div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Descripción (opcional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
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
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
          />
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm"
          >
            {submitting ? 'Actualizando...' : 'Actualizar Template'}
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
