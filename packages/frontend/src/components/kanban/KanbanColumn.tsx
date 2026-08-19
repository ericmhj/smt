'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import KanbanCard, { KanbanCardData } from './KanbanCard';

// ---------- Sort types ----------

export type SortField = 'createdAt' | 'fechaProgramada' | 'formName' | 'clienteNombre' | 'unreadObservations';
export type SortDirection = 'asc' | 'desc';

const SORT_LABELS: Record<SortField, string> = {
  createdAt: 'Fecha creación',
  fechaProgramada: 'Fecha programada',
  formName: 'Formulario',
  clienteNombre: 'Cliente',
  unreadObservations: 'Observaciones',
};

// ---------- Props ----------

interface KanbanColumnProps {
  title: string;
  state: string;
  cards: KanbanCardData[];
  color: string;
  draggable?: boolean;
  defaultSortField?: SortField;
  defaultSortDirection?: SortDirection;
  onDragStart?: (cardId: string, currentState: string) => void;
  onDrop?: (cardId: string, fromState: string, toState: string) => void;
  onCardClick?: (cardId: string) => void;
  onFormClick?: (cardId: string) => void;
  onPdfClick?: (cardId: string) => void;
}

// ---------- Component ----------

export default function KanbanColumn({
  title,
  state,
  cards,
  color,
  draggable,
  defaultSortField = 'createdAt',
  defaultSortDirection = 'desc',
  onDragStart,
  onDrop,
  onCardClick,
  onFormClick,
  onPdfClick,
}: KanbanColumnProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const columnRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  const [sortField, setSortField] = useState<SortField>(defaultSortField);
  const [sortDirection, setSortDirection] = useState<SortDirection>(defaultSortDirection);

  // Auto-detect compact mode based on card count and available height
  useEffect(() => {
    const checkSize = () => {
      if (columnRef.current) {
        const availableHeight = window.innerHeight - 200;
        const estimatedCardHeight = cards.length > 5 ? 90 : 140;
        const totalNeeded = cards.length * estimatedCardHeight;
        setCompact(totalNeeded > availableHeight || cards.length > 6);
      }
    };
    checkSize();
    window.addEventListener('resize', checkSize);
    return () => window.removeEventListener('resize', checkSize);
  }, [cards.length]);

  // Sort cards
  const sortedCards = useMemo(() => {
    const sorted = [...cards].sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'createdAt': {
          const dateA = new Date(a.createdAt).getTime();
          const dateB = new Date(b.createdAt).getTime();
          comparison = dateA - dateB;
          break;
        }
        case 'fechaProgramada': {
          const dateA = a.fechaProgramada ? new Date(a.fechaProgramada).getTime() : 0;
          const dateB = b.fechaProgramada ? new Date(b.fechaProgramada).getTime() : 0;
          comparison = dateA - dateB;
          break;
        }
        case 'formName':
          comparison = a.formName.localeCompare(b.formName, 'es');
          break;
        case 'clienteNombre': {
          const nameA = a.clienteNombre || '';
          const nameB = b.clienteNombre || '';
          comparison = nameA.localeCompare(nameB, 'es');
          break;
        }
        case 'unreadObservations':
          comparison = a.unreadObservations - b.unreadObservations;
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }, [cards, sortField, sortDirection]);

  const toggleDirection = () => {
    setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
  };

  return (
    <div className="flex-1 min-w-[220px]" ref={columnRef}>
      {/* Column header */}
      <div className="flex items-center gap-2 mb-2">
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
          {cards.length}
        </span>
      </div>

      {/* Sort controls */}
      {cards.length > 1 && (
        <div className="flex items-center gap-1 mb-2">
          <select
            value={sortField}
            onChange={(e) => setSortField(e.target.value as SortField)}
            className="flex-1 text-[11px] px-1.5 py-1 border border-gray-200 rounded bg-white text-gray-600 outline-none focus:border-blue-400"
            aria-label={`Ordenar columna ${title}`}
          >
            {Object.entries(SORT_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <button
            onClick={toggleDirection}
            className="p-1 rounded hover:bg-gray-200 text-gray-500 transition-colors"
            aria-label={sortDirection === 'desc' ? 'Orden descendente (más reciente arriba)' : 'Orden ascendente (más antiguo arriba)'}
            title={sortDirection === 'desc' ? '↓ Más reciente arriba' : '↑ Más antiguo arriba'}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className={`h-3.5 w-3.5 transition-transform ${sortDirection === 'asc' ? 'rotate-180' : ''}`}
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      )}

      {/* Cards container */}
      <div
        className={`min-h-[200px] rounded-lg p-2 transition-colors overflow-y-auto ${
          isDragOver ? 'bg-blue-50 border-2 border-blue-300 border-dashed' : 'bg-gray-50'
        } ${compact ? 'space-y-1.5' : 'space-y-2'}`}
        style={{ maxHeight: 'calc(100vh - 240px)' }}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          const cardId = e.dataTransfer.getData('cardId');
          const fromState = e.dataTransfer.getData('fromState');
          if (cardId && fromState && fromState !== state) {
            onDrop?.(cardId, fromState, state);
          }
        }}
      >
        {sortedCards.map((card) => (
          <KanbanCard
            key={card.id}
            card={{ ...card, state }}
            draggable={draggable}
            compact={compact}
            onCardClick={onCardClick}
            onFormClick={onFormClick}
            onPdfClick={onPdfClick}
          />
        ))}
        {cards.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-8">Sin ensayos</p>
        )}
      </div>
    </div>
  );
}
