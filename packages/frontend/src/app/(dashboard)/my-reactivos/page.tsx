'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import ReactivoList, { ReactivoItem } from '@/components/reactivos/ReactivoList';

export default function MyReactivosPage() {
  const [reactivos, setReactivos] = useState<ReactivoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [stateFilter, setStateFilter] = useState('');

  const fetchReactivos = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (stateFilter) params.set('state', stateFilter);
      const data = await api<{ reactivos: ReactivoItem[] }>(`/api/reactivos/my?${params.toString()}`);
      setReactivos(data.reactivos || []);
    } catch {
      setReactivos([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReactivos();
  }, [stateFilter]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Mis Reactivos</h1>

      <div className="mb-4">
        <select
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        >
          <option value="">Todos los estados</option>
          <option value="pendiente">Pendiente</option>
          <option value="en_revision">En revisión</option>
          <option value="validado">Validado</option>
          <option value="rechazado">Rechazado</option>
          <option value="finalizado">Finalizado</option>
        </select>
      </div>

      {loading ? (
        <p className="text-gray-500">Cargando...</p>
      ) : (
        <ReactivoList reactivos={reactivos} onReapply={fetchReactivos} />
      )}
    </div>
  );
}
