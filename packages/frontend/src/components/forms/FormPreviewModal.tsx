'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

interface FormPreviewModalProps {
  formId: string;
  formName: string;
  onClose: () => void;
}

interface FormDetailResponse {
  id: string;
  name: string;
  currentVersionData: {
    htmlContent: string;
    sanitizedHtml: string;
  };
}

export default function FormPreviewModal({ formId, formName, onClose }: FormPreviewModalProps) {
  const [html, setHtml] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchForm = async () => {
      try {
        const data = await api<FormDetailResponse>(`/api/forms/${formId}`);
        setHtml(data.currentVersionData?.htmlContent || data.currentVersionData?.sanitizedHtml || '');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al cargar formulario');
      } finally {
        setLoading(false);
      }
    };
    fetchForm();
  }, [formId]);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-800">{formName}</h2>
            <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 text-xs font-medium rounded-full">
              Solo vista previa
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl font-bold"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading && <p className="text-gray-500">Cargando formulario...</p>}
          {error && <p className="text-red-600 text-sm">{error}</p>}
          {!loading && !error && (
            <div className="border border-gray-200 rounded-md p-4">
              <div className="mb-3 p-2 bg-blue-50 rounded-md">
                <p className="text-xs text-blue-700">
                  ℹ️ Este formulario es solo para validar el formato. Los datos ingresados no se guardarán.
                </p>
              </div>
              <div dangerouslySetInnerHTML={{ __html: html }} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-4 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-sm"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
