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

export default function RejectionInfoModal({
  reactivoId,
  rejectionReason,
  formName,
  responses,
  onClose,
  onReapplySuccess,
}: RejectionInfoModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleReapply = async () => {
    setLoading(true);
    setError('');
    try {
      const newReactivo = await api<{ id: string; responses: Record<string, unknown> }>(
        `/api/reactivos/${reactivoId}/reapply`,
        {
          method: 'POST',
          body: JSON.stringify({ responses }),
        },
      );
      onReapplySuccess(newReactivo.id, responses);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al re-enviar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-red-700">Ensayo Rechazado</h2>
          <p className="text-sm text-gray-500 mt-1">{formName}</p>
        </div>

        {/* Body */}
        <div className="px-6 py-4">
          <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-4">
            <p className="text-sm font-medium text-red-800 mb-1">Motivo del rechazo:</p>
            <p className="text-sm text-red-700">{rejectionReason || 'Sin motivo especificado'}</p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-yellow-50 text-yellow-800 rounded-md text-sm">{error}</div>
          )}

          <p className="text-sm text-gray-600">
            Puedes corregir y re-enviar el ensayo. Se creará un nuevo intento con los datos anteriores pre-cargados.
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 text-sm"
          >
            Cerrar
          </button>
          <button
            onClick={handleReapply}
            disabled={loading}
            className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50 text-sm"
          >
            {loading ? 'Procesando...' : 'Re-enviar ensayo'}
          </button>
        </div>
      </div>
    </div>
  );
}
