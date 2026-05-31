'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import KanbanColumn from './KanbanColumn';
import { KanbanCardData } from './KanbanCard';

interface KanbanData {
  pendiente: KanbanCardData[];
  en_revision: KanbanCardData[];
  validado: KanbanCardData[];
  rechazado: KanbanCardData[];
  finalizado: KanbanCardData[];
}

const columns = [
  { key: 'pendiente', title: 'Pendiente', color: '#eab308' },
  { key: 'en_revision', title: 'En revisión', color: '#3b82f6' },
  { key: 'validado', title: 'Validado', color: '#22c55e' },
  { key: 'rechazado', title: 'Rechazado', color: '#ef4444' },
  { key: 'finalizado', title: 'Finalizado', color: '#6b7280' },
];

export default function KanbanBoard() {
  const [data, setData] = useState<KanbanData>({
    pendiente: [],
    en_revision: [],
    validado: [],
    rechazado: [],
    finalizado: [],
  });
  const [loading, setLoading] = useState(true);
  const [filterTechnician, setFilterTechnician] = useState('');
  const [filterForm, setFilterForm] = useState('');

  useEffect(() => {
    const fetchKanban = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (filterTechnician) params.set('technician', filterTechnician);
        if (filterForm) params.set('form', filterForm);
        const result = await api<KanbanData>(`/api/kanban?${params.toString()}`);
        setData(result);
      } catch {
        // keep empty
      } finally {
        setLoading(false);
      }
    };
    fetchKanban();
  }, [filterTechnician, filterForm]);

  if (loading) return <p className="text-gray-500">Cargando tablero...</p>;

  return (
    <div>
      <div className="flex gap-4 mb-4">
        <input
          type="text"
          placeholder="Filtrar por técnico..."
          value={filterTechnician}
          onChange={(e) => setFilterTechnician(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        />
        <input
          type="text"
          placeholder="Filtrar por formulario..."
          value={filterForm}
          onChange={(e) => setFilterForm(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        />
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((col) => (
          <KanbanColumn
            key={col.key}
            title={col.title}
            state={col.key}
            cards={data[col.key as keyof KanbanData] || []}
            color={col.color}
          />
        ))}
      </div>
    </div>
  );
}
