'use client';

import { useState } from 'react';
import SignatureCanvas from '@/components/signature/SignatureCanvas';
import SignatureUpload from '@/components/signature/SignatureUpload';

interface TransitionDialogProps {
  currentState: string;
  availableStates: string[];
  onConfirm: (targetState: string, signatureData: string, reason?: string) => void;
  onCancel: () => void;
  loading?: boolean;
}

const stateLabels: Record<string, string> = {
  pendiente: 'Pendiente',
  en_revision: 'En revisión',
  validado: 'Validado',
  rechazado: 'Rechazado',
  finalizado: 'Finalizado',
};

export default function TransitionDialog({
  currentState,
  availableStates,
  onConfirm,
  onCancel,
  loading,
}: TransitionDialogProps) {
  const [targetState, setTargetState] = useState(availableStates[0] || '');
  const [reason, setReason] = useState('');
  const [signatureData, setSignatureData] = useState('');
  const [signatureMode, setSignatureMode] = useState<'draw' | 'upload'>('draw');

  const requiresReason = targetState === 'rechazado';

  const handleConfirm = () => {
    if (!signatureData) {
      alert('Debe proporcionar una firma');
      return;
    }
    if (requiresReason && !reason.trim()) {
      alert('Debe proporcionar un motivo para el rechazo');
      return;
    }
    onConfirm(targetState, signatureData, reason || undefined);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Transición de estado</h2>

        <div className="space-y-4">
          <div>
            <p className="text-sm text-gray-500 mb-1">
              Estado actual: <span className="font-medium">{stateLabels[currentState]}</span>
            </p>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nuevo estado</label>
            <select
              value={targetState}
              onChange={(e) => setTargetState(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              {availableStates.map((s) => (
                <option key={s} value={s}>{stateLabels[s] || s}</option>
              ))}
            </select>
          </div>

          {requiresReason && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Motivo del rechazo *
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                placeholder="Explique el motivo del rechazo..."
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Firma digital</label>
            <div className="flex gap-2 mb-2">
              <button
                type="button"
                onClick={() => setSignatureMode('draw')}
                className={`px-3 py-1 text-xs rounded-md ${signatureMode === 'draw' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}
              >
                Dibujar
              </button>
              <button
                type="button"
                onClick={() => setSignatureMode('upload')}
                className={`px-3 py-1 text-xs rounded-md ${signatureMode === 'upload' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}
              >
                Subir imagen
              </button>
            </div>

            {signatureMode === 'draw' ? (
              <SignatureCanvas onSave={setSignatureData} />
            ) : (
              <SignatureUpload onUpload={setSignatureData} />
            )}
          </div>
        </div>

        <div className="flex gap-3 mt-6 pt-4 border-t">
          <button
            onClick={handleConfirm}
            disabled={loading || !signatureData}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm"
          >
            {loading ? 'Procesando...' : 'Confirmar transición'}
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
