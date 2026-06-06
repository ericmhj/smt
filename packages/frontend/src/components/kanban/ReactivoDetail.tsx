'use client';

import { stateLabels } from '@/lib/states';
import StateHistory from './StateHistory';
import AttemptChain from './AttemptChain';

interface ReactivoDetailProps {
  reactivo: {
    id: string;
    formName: string;
    technicianName: string;
    state: string;
    attempt: number;
    responses: Record<string, unknown>;
    createdAt: string;
    transitions: Array<{
      id: string;
      fromState: string;
      toState: string;
      performedBy: string;
      reason?: string;
      createdAt: string;
      hasSignature: boolean;
    }>;
    attempts: Array<{
      id: string;
      attempt: number;
      state: string;
      createdAt: string;
    }>;
  };
}

export default function ReactivoDetail({ reactivo }: ReactivoDetailProps) {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">{reactivo.formName}</h2>
            <p className="text-sm text-gray-500">Técnico: {reactivo.technicianName}</p>
          </div>
          <span className="px-3 py-1 text-sm font-medium rounded-full bg-gray-100 text-gray-700">
            {stateLabels[reactivo.state] || reactivo.state}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Intento:</span>
            <span className="ml-2 font-medium">#{reactivo.attempt}</span>
          </div>
          <div>
            <span className="text-gray-500">Creado:</span>
            <span className="ml-2">{new Date(reactivo.createdAt).toLocaleString('es')}</span>
          </div>
        </div>
      </div>

      {/* Responses */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Respuestas</h3>
        <div className="space-y-2">
          {Object.entries(reactivo.responses).map(([key, value]) => (
            <div key={key} className="flex justify-between text-sm border-b pb-2">
              <span className="text-gray-600">{key}</span>
              <span className="text-gray-800 font-medium">{String(value)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Attempt chain */}
      {reactivo.attempts.length > 1 && (
        <div className="bg-white rounded-lg shadow p-4">
          <AttemptChain attempts={reactivo.attempts} currentId={reactivo.id} />
        </div>
      )}

      {/* State history */}
      <div className="bg-white rounded-lg shadow p-4">
        <StateHistory transitions={reactivo.transitions} />
      </div>
    </div>
  );
}
