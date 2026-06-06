'use client';

import { stateLabels } from '@/lib/states';

interface StateTransition {
  id: string;
  fromState: string;
  toState: string;
  performedBy: string;
  reason?: string;
  createdAt: string;
  hasSignature: boolean;
}

interface StateHistoryProps {
  transitions: StateTransition[];
}

export default function StateHistory({ transitions }: StateHistoryProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-700">Historial de estados</h3>
      {transitions.length === 0 ? (
        <p className="text-sm text-gray-500">Sin transiciones registradas.</p>
      ) : (
        <div className="relative">
          <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-gray-200" />
          <div className="space-y-4">
            {transitions.map((t) => (
              <div key={t.id} className="relative pl-8">
                <div className="absolute left-1.5 top-1.5 w-3 h-3 rounded-full bg-blue-500 border-2 border-white" />
                <div className="bg-gray-50 rounded-md p-3">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-500">{stateLabels[t.fromState] || t.fromState}</span>
                    <span className="text-gray-400">→</span>
                    <span className="font-medium text-gray-700">{stateLabels[t.toState] || t.toState}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Por: {t.performedBy} • {new Date(t.createdAt).toLocaleString('es')}
                  </p>
                  {t.reason && (
                    <p className="text-xs text-gray-600 mt-1 italic">Motivo: {t.reason}</p>
                  )}
                  {t.hasSignature && (
                    <span className="inline-flex items-center text-xs text-green-600 mt-1">✓ Firmado</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
