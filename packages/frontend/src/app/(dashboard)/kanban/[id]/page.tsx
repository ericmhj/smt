'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import ReactivoDetail from '@/components/kanban/ReactivoDetail';
import TransitionDialog from '@/components/kanban/TransitionDialog';

interface ReactivoData {
  id: string;
  formName: string;
  technicianName: string;
  state: string;
  attempt: number;
  responses: Record<string, unknown>;
  createdAt: string;
  availableTransitions: string[];
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
}

export default function ReactivoDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [reactivo, setReactivo] = useState<ReactivoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTransition, setShowTransition] = useState(false);
  const [transitioning, setTransitioning] = useState(false);

  const fetchReactivo = async () => {
    try {
      const data = await api<ReactivoData>(`/api/kanban/${params.id}/detail`);
      setReactivo(data);
    } catch {
      setReactivo(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReactivo();
  }, [params.id]);

  const handleTransition = async (targetState: string, signatureId: string, reason?: string) => {
    setTransitioning(true);
    try {
      await api(`/api/kanban/${params.id}/transition`, {
        method: 'POST',
        body: JSON.stringify({ toState: targetState, signatureId, reason }),
      });
      setShowTransition(false);
      fetchReactivo();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error en la transición');
    } finally {
      setTransitioning(false);
    }
  };

  if (loading) return <p className="text-gray-500">Cargando...</p>;
  if (!reactivo) return <p className="text-red-500">Ensayo no encontrado.</p>;

  // Calculate available transitions based on current state
  const VALID_TRANSITIONS: Record<string, string[]> = {
    pendiente: ['en_revision'],
    en_revision: ['validado', 'rechazado'],
    validado: ['finalizado'],
    rechazado: [],
    finalizado: [],
  };
  const availableTransitions = VALID_TRANSITIONS[reactivo.state] || [];
  const canTransition = user?.role === 'manager' && availableTransitions.length > 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Detalle del ensayo</h1>
        <div className="flex gap-2">
          {canTransition && (
            <button
              onClick={() => setShowTransition(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
            >
              Cambiar estado
            </button>
          )}
          <button
            onClick={() => router.push('/kanban')}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm"
          >
            Volver al tablero
          </button>
        </div>
      </div>

      <ReactivoDetail reactivo={reactivo} />

      {showTransition && (
        <TransitionDialog
          currentState={reactivo.state}
          availableStates={availableTransitions}
          onConfirm={handleTransition}
          onCancel={() => setShowTransition(false)}
          loading={transitioning}
        />
      )}
    </div>
  );
}
