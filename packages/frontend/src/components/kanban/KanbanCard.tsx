'use client';

import { useState } from 'react';

export interface KanbanCardData {
  id: string;
  tecnicoName: string;
  formName: string;
  attemptNumber: number;
  unreadObservations: number;
  createdAt: string;
  state: string;
  clienteNombre?: string;
  fechaProgramada?: string;
}

interface KanbanCardProps {
  card: KanbanCardData;
  draggable?: boolean;
  compact?: boolean;
  onCardClick?: (cardId: string) => void;
  onFormClick?: (cardId: string) => void;
  onPdfClick?: (cardId: string) => void;
}

export default function KanbanCard({ card, draggable, compact, onCardClick, onFormClick, onPdfClick }: KanbanCardProps) {
  const hasActionButtons = !!(onFormClick || onPdfClick);
  const [isHovered, setIsHovered] = useState(false);

  // In compact mode: collapsed by default, expands on hover
  const isExpanded = !compact || isHovered;

  return (
    <div
      draggable={draggable || false}
      onDragStart={(e) => {
        e.dataTransfer.setData('cardId', card.id);
        e.dataTransfer.setData('fromState', card.state);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={(e) => {
        if (e.defaultPrevented) return;
        if (!hasActionButtons && onCardClick) {
          onCardClick(card.id);
        }
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`bg-white rounded-lg border select-none transition-all duration-300 ease-out origin-center ${
        draggable ? 'cursor-grab active:cursor-grabbing' : !hasActionButtons && onCardClick ? 'cursor-pointer' : ''
      } ${
        isHovered
          ? 'shadow-xl scale-[1.06] z-20 border-blue-400 -translate-y-1 p-3'
          : compact
            ? 'shadow-sm border-gray-200 p-2.5 scale-100'
            : 'shadow-sm border-gray-200 p-3 hover:shadow-md'
      }`}
    >
      {/* Compact collapsed: two lines with more info */}
      {!isExpanded && (
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            {card.unreadObservations > 0 && (
              <span className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0 animate-pulse" />
            )}
            <p className="text-xs font-medium text-gray-800 truncate flex-1">{card.formName}</p>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-gray-500">👤 {card.tecnicoName}</span>
            <span className="text-[10px] text-gray-400">{new Date(card.createdAt).toLocaleDateString('es')}</span>
          </div>
        </div>
      )}

      {/* Expanded: full content */}
      {isExpanded && (
        <>
          <div className="flex items-start justify-between">
            <p className="text-sm font-medium text-gray-800 truncate">{card.formName}</p>
            {card.unreadObservations > 0 && (
              <span className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0 mt-1 animate-pulse" />
            )}
          </div>
          {card.clienteNombre && (
            <p className="text-xs text-blue-600 mt-0.5 truncate">🏢 {card.clienteNombre}</p>
          )}
          <p className="text-xs text-gray-500 mt-0.5">👤 {card.tecnicoName}</p>
          <div className="flex items-center justify-between mt-2">
            {card.fechaProgramada ? (
              <span className="text-xs text-orange-600">
                📅 {new Date(card.fechaProgramada).toLocaleDateString('es')}
              </span>
            ) : (
              <span className="text-xs text-gray-400">Intento #{card.attemptNumber}</span>
            )}
            <span className="text-xs text-gray-400">
              {new Date(card.createdAt).toLocaleDateString('es')}
            </span>
          </div>

          {/* Action buttons */}
          {hasActionButtons && (
            <div className="flex gap-1.5 mt-2.5 pt-2 border-t border-gray-100">
              {onFormClick && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onFormClick(card.id);
                  }}
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 rounded hover:bg-blue-100 transition-colors"
                  title="Ver formulario llenado"
                >
                  📋 Formulario
                </button>
              )}
              {onPdfClick && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onPdfClick(card.id);
                  }}
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 rounded hover:bg-emerald-100 transition-colors"
                  title="Ver reporte PDF"
                >
                  📄 Reporte PDF
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
