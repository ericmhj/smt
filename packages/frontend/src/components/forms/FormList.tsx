'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { FormItem } from '@/app/(dashboard)/forms/page';
import FormPreviewModal from './FormPreviewModal';

interface FormListProps {
  forms: FormItem[];
  onToggleActive?: (id: string, isActive: boolean) => void;
  onDelete?: (id: string) => void;
  userRole?: string;
}

export default function FormList({ forms, onToggleActive, onDelete, userRole }: FormListProps) {
  const [previewForm, setPreviewForm] = useState<{ id: string; name: string } | null>(null);

  return (
    <>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nombre</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Versión</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {forms.map((form) => (
              <tr key={form.id}>
                <td className="px-4 py-3">
                  <button
                    onClick={() => setPreviewForm({ id: form.id, name: form.name })}
                    className="text-blue-600 hover:text-blue-800 font-medium text-sm text-left"
                  >
                    {form.name}
                  </button>
                  {form.description && (
                    <p className="text-xs text-gray-500 mt-0.5">{form.description}</p>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">v{form.currentVersion}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                      form.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {form.isActive ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm space-x-2">
                  <button
                    onClick={() => setPreviewForm({ id: form.id, name: form.name })}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    Ver
                  </button>
                  {onToggleActive && (
                    <button
                      onClick={() => onToggleActive(form.id, !form.isActive)}
                      className={form.isActive ? 'text-red-600 hover:text-red-800' : 'text-green-600 hover:text-green-800'}
                    >
                      {form.isActive ? 'Desactivar' : 'Activar'}
                    </button>
                  )}
                  {onDelete && userRole === 'superusuario' && (
                    <button
                      onClick={() => { if(confirm('¿Eliminar este formulario? Esta acción no se puede deshacer.')) onDelete(form.id); }}
                      className="text-red-600 hover:text-red-800 font-medium"
                    >
                      Eliminar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {forms.length === 0 && (
          <p className="text-center text-gray-500 py-8">No hay formularios registrados.</p>
        )}
      </div>

      {previewForm && (
        <FormPreviewModal
          formId={previewForm.id}
          formName={previewForm.name}
          onClose={() => setPreviewForm(null)}
        />
      )}
    </>
  );
}
