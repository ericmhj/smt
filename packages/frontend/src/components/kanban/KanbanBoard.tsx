'use client';

import { useState, useEffect } from 'react';
import { api, apiUpload } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import KanbanColumn from './KanbanColumn';
import TransitionDialog from './TransitionDialog';
import { KanbanCardData } from './KanbanCard';

interface KanbanColumnData {
  state: string;
  label: string;
  cards: KanbanCardData[];
}

interface KanbanResponse {
  columns: KanbanColumnData[];
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  pendiente: ['en_revision'],
  en_revision: ['validado', 'rechazado'],
  validado: ['finalizado'],
  rechazado: [],
  finalizado: [],
};

const columnsConfig = [
  { key: 'pendiente', title: 'Programado', color: '#eab308' },
  { key: 'en_revision', title: 'En Evaluación', color: '#3b82f6' },
  { key: 'validado', title: 'Validado', color: '#22c55e' },
  { key: 'rechazado', title: 'Rechazado', color: '#ef4444' },
  { key: 'finalizado', title: 'Finalizado', color: '#6b7280' },
];

export default function KanbanBoard() {
  const { user } = useAuth();
  const [data, setData] = useState<KanbanColumnData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTechnician, setFilterTechnician] = useState('');
  const [filterForm, setFilterForm] = useState('');

  // Transition dialog state
  const [showTransition, setShowTransition] = useState(false);
  const [transitionCardId, setTransitionCardId] = useState('');
  const [transitionFromState, setTransitionFromState] = useState('');
  const [transitionToState, setTransitionToState] = useState('');
  const [transitioning, setTransitioning] = useState(false);
  const [transitionError, setTransitionError] = useState('');

  const isManager = true; // All roles can attempt drag, backend validates permissions

  const fetchKanban = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterTechnician) params.set('tecnicoId', filterTechnician);
      if (filterForm) params.set('formId', filterForm);
      const result = await api<KanbanResponse>(`/api/kanban?${params.toString()}`);
      setData(result.columns || []);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKanban();
  }, [filterTechnician, filterForm]);

  const handleDrop = (cardId: string, fromState: string, toState: string) => {
    // Check if transition is valid
    const validTargets = VALID_TRANSITIONS[fromState] || [];
    if (!validTargets.includes(toState)) {
      setTransitionError(`No se puede mover de "${fromState}" a "${toState}". Solo se permiten transiciones hacia adelante.`);
      setTimeout(() => setTransitionError(''), 4000);
      return;
    }

    // Open transition dialog
    setTransitionCardId(cardId);
    setTransitionFromState(fromState);
    setTransitionToState(toState);
    setShowTransition(true);
  };

  const handleConfirmTransition = async (targetState: string, signatureId: string, reason?: string) => {
    setTransitioning(true);
    try {
      await api(`/api/kanban/${transitionCardId}/transition`, {
        method: 'POST',
        body: JSON.stringify({ toState: targetState, signatureId, reason }),
      });
      setShowTransition(false);
      setTransitionError('');
      fetchKanban(); // Refresh board
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error en la transición');
    } finally {
      setTransitioning(false);
    }
  };

  if (loading) return <p className="text-gray-500">Cargando tablero...</p>;

  return (
    <div>
      {transitionError && (
        <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md mb-4 flex items-center justify-between">
          <span>{transitionError}</span>
          <button onClick={() => setTransitionError('')} className="text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      <div className="flex gap-4 mb-4">
        <input
          type="text"
          placeholder="Filtrar por técnico (UUID)..."
          value={filterTechnician}
          onChange={(e) => setFilterTechnician(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        />
        <input
          type="text"
          placeholder="Filtrar por formulario (UUID)..."
          value={filterForm}
          onChange={(e) => setFilterForm(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        />
        {isManager && (
          <p className="text-xs text-blue-600 self-center">💡 Arrastra tarjetas entre columnas para cambiar estado</p>
        )}
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {columnsConfig.map((col) => {
          const column = data.find((c) => c.state === col.key);
          return (
            <KanbanColumn
              key={col.key}
              title={col.title}
              state={col.key}
              cards={column?.cards || []}
              color={col.color}
              draggable={isManager}
              onDragStart={() => {}}
              onDrop={handleDrop}
            />
          );
        })}
      </div>

      {showTransition && (
        <TransitionDialog
          currentState={transitionFromState}
          availableStates={[transitionToState]}
          onConfirm={handleConfirmTransition}
          onCancel={() => setShowTransition(false)}
          loading={transitioning}
        />
      )}
    </div>
  );
}
