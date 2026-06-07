'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import KanbanColumn from '@/components/kanban/KanbanColumn';
import { KanbanCardData } from '@/components/kanban/KanbanCard';

interface KanbanColumnData {
  state: string;
  label: string;
  cards: KanbanCardData[];
}

interface KanbanResponse {
  columns: KanbanColumnData[];
}

const columnsConfig = [
  { key: 'pendiente', title: 'Programado', color: '#eab308' },
  { key: 'en_revision', title: 'En Evaluación', color: '#3b82f6' },
  { key: 'validado', title: 'Validado', color: '#22c55e' },
  { key: 'rechazado', title: 'Rechazado', color: '#ef4444' },
  { key: 'finalizado', title: 'Finalizado', color: '#6b7280' },
];

export default function MyKanbanPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [data, setData] = useState<KanbanColumnData[]>([]);
  const [loading, setLoading] = useState(true);

  // PDF viewer state
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    if (!user || authLoading) return;
    const fetchKanban = async () => {
      setLoading(true);
      try {
        const result = await api<KanbanResponse>(`/api/kanban?tecnicoId=${user.id}`);
        setData(result.columns || []);
      } catch {
        setData([]);
      } finally {
        setLoading(false);
      }
    };
    fetchKanban();
  }, [user, authLoading]);

  if (authLoading || !user) return <p className="text-gray-500">Cargando...</p>;

  const handleCardClick = async (cardId: string) => {
    if (pdfUrl) return;

    const confirmed = window.confirm('¿Desea abrir el PDF del ensayo?');
    if (!confirmed) return;

    setPdfLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`http://localhost:3001/api/reactivos/${cardId}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        setPdfUrl(url);
      } else {
        alert('Error al obtener el PDF');
      }
    } catch {
      alert('Error de conexión');
    } finally {
      setPdfLoading(false);
    }
  };

  const closePdfViewer = () => {
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
      setPdfUrl(null);
    }
  };

  if (loading) return <p className="text-gray-500">Cargando tablero...</p>;

  const totalCards = data.reduce((sum, col) => sum + col.cards.length, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Mis Ensayos</h1>
        <span className="text-sm text-gray-500">{totalCards} ensayo{totalCards !== 1 ? 's' : ''} asignado{totalCards !== 1 ? 's' : ''}</span>
      </div>

      {totalCards === 0 && (
        <p className="text-sm text-gray-500 mb-4">No tienes ensayos asignados actualmente.</p>
      )}

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
              draggable={false}
              onDragStart={() => {}}
              onDrop={() => {}}
              onCardClick={handleCardClick}
            />
          );
        })}
      </div>

      {/* PDF Loading overlay */}
      {pdfLoading && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
            <p className="text-white font-medium">Cargando PDF...</p>
          </div>
        </div>
      )}

      {/* PDF Viewer Frame */}
      {pdfUrl && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-2xl w-[90vw] h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="text-sm font-semibold text-gray-700">Visor de PDF</h3>
              <button
                onClick={closePdfViewer}
                className="px-3 py-1 bg-red-50 text-red-600 rounded-md hover:bg-red-100 text-sm font-medium"
              >
                Cerrar PDF
              </button>
            </div>
            <iframe
              src={pdfUrl}
              className="flex-1 w-full"
              title="PDF del ensayo"
            />
          </div>
        </div>
      )}
    </div>
  );
}
