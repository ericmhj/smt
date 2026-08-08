'use client';

import { useState, useRef, useEffect } from 'react';
import KanbanCard, { KanbanCardData } from './KanbanCard';

interface KanbanColumnProps {
  title: string;
  state: string;
  cards: KanbanCardData[];
  color: string;
  draggable?: boolean;
  onDragStart?: (cardId: string, currentState: string) => void;
  onDrop?: (cardId: string, fromState: string, toState: string) => void;
  onCardClick?: (cardId: string) => void;
  onFormClick?: (cardId: string) => void;
  onPdfClick?: (cardId: string) => void;
}

export default function KanbanColumn({ title, state, cards, color, draggable, onDragStart, onDrop, onCardClick, onFormClick, onPdfClick }: KanbanColumnProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const columnRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);

  // Auto-detect compact mode based on card count and available height
  useEffect(() => {
    const checkSize = () => {
      if (columnRef.current) {
        const availableHeight = window.innerHeight - 200; // Approximate header/filters height
        const estimatedCardHeight = cards.length > 5 ? 90 : 140;
        const totalNeeded = cards.length * estimatedCardHeight;
        setCompact(totalNeeded > availableHeight || cards.length > 6);
      }
    };
    checkSize();
    window.addEventListener('resize', checkSize);
    return () => window.removeEventListener('resize', checkSize);
  }, [cards.length]);

  return (
    <div className="flex-1 min-w-[220px]" ref={columnRef}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
          {cards.length}
        </span>
      </div>
      <div
        className={`min-h-[200px] rounded-lg p-2 transition-colors overflow-y-auto ${
          isDragOver ? 'bg-blue-50 border-2 border-blue-300 border-dashed' : 'bg-gray-50'
        } ${compact ? 'space-y-1.5' : 'space-y-2'}`}
        style={{ maxHeight: 'calc(100vh - 200px)' }}
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
        {cards.map((card) => (
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
