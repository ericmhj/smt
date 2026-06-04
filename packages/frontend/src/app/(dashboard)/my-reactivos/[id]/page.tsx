'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';

interface ReactivoDetail {
  id: string;
  formId: string;
  tecnicoId: string;
  attemptNumber: number;
  state: string;
  responses: Record<string, unknown>;
  rejectionReason: string | null;
  createdAt: string;
  form: { id: string; name: string; slug: string };
  tecnico: { id: string; name: string; email: string };
  stateTransitions: Array<{
    id: string;
    fromState: string;
    toState: string;
    actorId: string;
    reason: string | null;
    createdAt: string;
  }>;
}

const stateLabels: Record<string, string> = {
  pendiente: 'Pendiente',
  en_revision: 'En revisión',
  validado: 'Validado',
  rechazado: 'Rechazado',
  finalizado: 'Finalizado',
};

const stateColors: Record<string, string> = {
  pendiente: 'bg-yellow-100 text-yellow-800',
  en_revision: 'bg-blue-100 text-blue-800',
  validado: 'bg-green-100 text-green-800',
  rechazado: 'bg-red-100 text-red-800',
  finalizado: 'bg-gray-100 text-gray-800',
};

export default function ReactivoDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [reactivo, setReactivo] = useState<ReactivoDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDetail = async () => {
      try {
        const data = await api<ReactivoDetail>(`/api/reactivos/${params.id}`);
        setReactivo(data);
      } catch {
        setReactivo(null);
      } finally {
        setLoading(false);
      }
    };
    fetchDetail();
  }, [params.id]);

  if (loading) return <p className="text-gray-500">Cargando...</p>;
  if (!reactivo) return <p className="text-red-500">Reactivo no encontrado.</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Detalle del Reactivo</h1>
        <button
          onClick={() => router.push('/my-reactivos')}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm"
        >
          Volver
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Info general */}
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-lg font-medium text-gray-700 mb-3">Información</h2>
          <div className="space-y-2 text-sm">
            <p><span className="font-medium">Formulario:</span> {reactivo.form.name}</p>
            <p><span className="font-medium">Intento:</span> #{reactivo.attemptNumber}</p>
            <p>
              <span className="font-medium">Estado:</span>{' '}
              <span className={`px-2 py-0.5 text-xs rounded-full ${stateColors[reactivo.state]}`}>
                {stateLabels[reactivo.state]}
              </span>
            </p>
            <p><span className="font-medium">Fecha:</span> {new Date(reactivo.createdAt).toLocaleString('es')}</p>
            {reactivo.rejectionReason && (
              <div className="mt-2 bg-red-50 border border-red-100 rounded p-2">
                <p className="text-xs text-red-700"><span className="font-medium">Motivo de rechazo:</span> {reactivo.rejectionReason}</p>
              </div>
            )}
          </div>
        </div>

        {/* Respuestas */}
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-lg font-medium text-gray-700 mb-3">Respuestas</h2>
          <div className="space-y-1 text-sm">
            {Object.entries(reactivo.responses).map(([key, value]) => (
              <p key={key}>
                <span className="font-medium">{key}:</span> {String(value)}
              </p>
            ))}
          </div>
        </div>

        {/* Historial de estados */}
        {reactivo.stateTransitions.length > 0 && (
          <div className="bg-white rounded-lg shadow p-4 lg:col-span-2">
            <h2 className="text-lg font-medium text-gray-700 mb-3">Historial de Estados</h2>
            <div className="space-y-2">
              {reactivo.stateTransitions.map((t) => (
                <div key={t.id} className="flex items-center gap-2 text-sm border-b pb-2">
                  <span className="text-gray-500">{new Date(t.createdAt).toLocaleString('es')}</span>
                  <span>{stateLabels[t.fromState]} → {stateLabels[t.toState]}</span>
                  {t.reason && <span className="text-gray-500 italic">({t.reason})</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
