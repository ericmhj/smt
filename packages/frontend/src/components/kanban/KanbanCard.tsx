'use client';

import { useState } from 'react';

export interface KanbanCardData {
  id: string;
  identificador?: string;
  tecnicoName: string;
  formName: string;
  attemptNumber: number;
  unreadObservations: number;
  createdAt: string;
  state: string;
  clienteNombre?: string;
  fechaProgramada?: string;
  isComplementary?: boolean;
  parentReactivoId?: string;
  complementaryAnnotation?: string;
  isBlocked?: boolean;
  bloqueadoHasta?: string;
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
          {card.identificador && (
            <p className="text-[10px] font-mono font-semibold text-indigo-700 truncate">#{card.identificador}</p>
          )}
          <div className="flex items-center gap-2">
            {card.isComplementary && (
              <span className={`px-1.5 py-0.5 text-[9px] font-semibold rounded flex-shrink-0 ${card.isBlocked ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                {card.isBlocked ? '🔒' : '🔄'} Compl.
              </span>
            )}
            {card.unreadObservations > 0 && (
              <span className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0 animate-pulse" />
            )}
            <p className="text-xs font-medium text-gray-800 truncate flex-1">{card.formName}</p>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-gray-500">👤 {card.tecnicoName}</span>
            <span className="text-[10px] text-gray-400">{new Date(card.createdAt).toLocaleDateString('es', { timeZone: 'UTC' })}</span>
          </div>
        </div>
      )}

      {/* Expanded: full content */}
      {isExpanded && (
        <>
          {card.identificador && (
            <p className="text-[11px] font-mono font-semibold text-indigo-700 truncate mb-0.5">#{card.identificador}</p>
          )}
          <div className="flex items-start justify-between">
            <p className="text-sm font-medium text-gray-800 truncate">{card.formName}</p>
            {card.unreadObservations > 0 && (
              <span className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0 mt-1 animate-pulse" />
            )}
          </div>
          {card.isComplementary && (
            <div className="mt-1 px-2 py-1 bg-amber-50 border border-amber-200 rounded">
              <span className="text-[10px] font-semibold text-amber-700">🔄 Estudio Complementario de Cumplimiento</span>
              {card.isBlocked && card.bloqueadoHasta && (
                <p className="text-[9px] text-red-600 font-medium mt-0.5">
                  🔒 Bloqueado hasta {new Date(card.bloqueadoHasta).toLocaleDateString('es', { timeZone: 'UTC' })}
                </p>
              )}
              {card.complementaryAnnotation && (
                <p className="text-[9px] text-amber-600 mt-0.5 line-clamp-2">{card.complementaryAnnotation}</p>
              )}
            </div>
          )}
          {card.clienteNombre && (
            <p className="text-xs text-blue-600 mt-0.5 truncate">🏢 {card.clienteNombre}</p>
          )}
          <p className="text-xs text-gray-500 mt-0.5">👤 {card.tecnicoName}</p>
          <div className="flex items-center justify-between mt-2">
            {card.fechaProgramada ? (
              <span className="text-xs text-orange-600">
                📅 {new Date(card.fechaProgramada).toLocaleDateString('es', { timeZone: 'UTC' })}
              </span>
            ) : (
              <span className="text-xs text-gray-400">Intento #{card.attemptNumber}</span>
            )}
            <span className="text-xs text-gray-400">
              {new Date(card.createdAt).toLocaleDateString('es', { timeZone: 'UTC' })}
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
