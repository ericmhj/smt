'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import HTMLEditor from '@/components/forms/HTMLEditor';
import FormTemplateCatalog from '@/components/forms/FormTemplateCatalog';

type CreationMode = 'template' | 'manual';

export default function NewFormPage() {
  const router = useRouter();
  const [mode, setMode] = useState<CreationMode>('template');
  const [name, setName] = useState('');
  const [htmlContent, setHtmlContent] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await api('/api/forms', {
        method: 'POST',
        body: JSON.stringify({ name, html: htmlContent }),
      });
      router.push('/forms');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear formulario');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Nuevo formulario</h1>

      {/* Creation mode tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        <button
          onClick={() => setMode('template')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            mode === 'template'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Desde template
        </button>
        <button
          onClick={() => setMode('manual')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            mode === 'manual'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Manual
        </button>
      </div>

      {mode === 'template' ? (
        <FormTemplateCatalog />
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md">{error}</div>
          )}

          <div className="grid grid-cols-1 gap-4">
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
          </div>

          <HTMLEditor value={htmlContent} onChange={setHtmlContent} />

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Creando...' : 'Crear formulario'}
            </button>
            <button
              type="button"
              onClick={() => router.push('/forms')}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
