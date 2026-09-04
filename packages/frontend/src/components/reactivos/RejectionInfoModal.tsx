'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

interface RejectionInfoModalProps {
  reactivoId: string;
  rejectionReason: string;
  formName: string;
  responses: Record<string, unknown>;
  onClose: () => void;
  onReapplySuccess: (newReactivoId: string, responses: Record<string, unknown>) => void;
}

interface ReapplyResponse {
  id: string;
  responses: Record<string, unknown>;
}

export default function RejectionInfoModal({
  reactivoId,
  rejectionReason,
  formName,
  responses,
  onClose,
  onReapplySuccess,
}: RejectionInfoModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleReapply = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await api<ReapplyResponse>(`/api/reactivos/${reactivoId}/reapply`, {
        method: 'POST',
        body: JSON.stringify({ responses }),
        headers: { 'Content-Type': 'application/json' },
      });
      onReapplySuccess(result.id, responses);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error de conexión');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-2xl w-[90vw] max-w-lg flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="text-lg font-semibold text-gray-800">Ensayo Rechazado</h3>
          <button
            onClick={onClose}
            disabled={loading}
            className="px-3 py-1 bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 text-sm font-medium disabled:opacity-50"
          >
            Cerrar
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          <p className="text-sm text-gray-500 mb-2">Formulario: <span className="font-medium text-gray-700">{formName}</span></p>

          <div className="mt-4">
            <p className="text-sm font-medium text-gray-700 mb-2">Motivo de rechazo:</p>
            <div className="p-4 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">
              {rejectionReason || 'No se proporcionó un motivo.'}
            </div>
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm font-medium disabled:opacity-50"
          >
            Cerrar
          </button>
          <button
            type="button"
            onClick={handleReapply}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium disabled:opacity-50 flex items-center gap-2"
          >
            {loading && (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}
            {loading ? 'Creando nuevo intento...' : 'Re-enviar ensayo'}
          </button>
        </div>
      </div>
    </div>
  );
}
