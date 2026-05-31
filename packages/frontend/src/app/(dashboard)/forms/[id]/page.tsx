'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

interface FormVersion {
  version: number;
  createdAt: string;
  changeType: string;
}

interface FormDetail {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  currentVersion: number;
  htmlContent: string;
  versions: FormVersion[];
}

export default function FormDetailPage() {
  const params = useParams();
  const [form, setForm] = useState<FormDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    const fetchForm = async () => {
      try {
        const data = await api<FormDetail>(`/api/forms/${params.id}`);
        setForm(data);
      } catch {
        setForm(null);
      } finally {
        setLoading(false);
      }
    };
    fetchForm();
  }, [params.id]);

  if (loading) return <p className="text-gray-500">Cargando...</p>;
  if (!form) return <p className="text-red-500">Formulario no encontrado.</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{form.name}</h1>
          {form.description && <p className="text-gray-500 text-sm">{form.description}</p>}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm"
          >
            {showPreview ? 'Ocultar vista previa' : 'Vista previa'}
          </button>
          <Link href="/forms" className="px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm">
            Volver
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center gap-4 mb-4">
              <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${form.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                {form.isActive ? 'Activo' : 'Inactivo'}
              </span>
              <span className="text-sm text-gray-500">Versión actual: v{form.currentVersion}</span>
            </div>

            {showPreview && form.htmlContent && (
              <div className="border rounded-md p-4 mt-4">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Vista previa</h3>
                <div
                  className="prose max-w-none"
                  dangerouslySetInnerHTML={{ __html: form.htmlContent }}
                />
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Historial de versiones</h3>
            <div className="space-y-2">
              {form.versions && form.versions.length > 0 ? (
                form.versions.map((v) => (
                  <div key={v.version} className="flex items-center justify-between text-sm border-b pb-2">
                    <span className="font-medium">v{v.version}</span>
                    <span className="text-gray-500 text-xs">
                      {new Date(v.createdAt).toLocaleDateString('es')}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-sm">Sin historial de versiones.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
