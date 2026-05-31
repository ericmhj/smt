'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface MyForm {
  id: string;
  formId: string;
  formName: string;
  formVersion: number;
  assignedAt: string;
}

export default function MyFormsPage() {
  const [forms, setForms] = useState<MyForm[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMyForms = async () => {
      try {
        const data = await api<MyForm[]>('/api/my-forms');
        setForms(data || []);
      } catch {
        setForms([]);
      } finally {
        setLoading(false);
      }
    };
    fetchMyForms();
  }, []);

  if (loading) return <p className="text-gray-500">Cargando...</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Mis Formularios</h1>

      {forms.length === 0 ? (
        <p className="text-gray-500">No tienes formularios asignados.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {forms.map((form) => (
            <div key={form.id} className="bg-white rounded-lg shadow p-4">
              <h3 className="font-medium text-gray-800">{form.formName}</h3>
              <p className="text-xs text-gray-500 mt-1">Versión: v{form.formVersion}</p>
              <p className="text-xs text-gray-500">
                Asignado: {new Date(form.assignedAt).toLocaleDateString('es')}
              </p>
              <Link
                href={`/my-forms/${form.id}/fill`}
                className="mt-3 inline-block px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
              >
                Llenar formulario
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
