'use client';

import { useState } from 'react';
import KanbanCard, { KanbanCardData } from './KanbanCard';

interface KanbanColumnProps {
  title: string;
  state: string;
  cards: KanbanCardData[];
  color: string;
  draggable?: boolean;
  onDragStart?: (cardId: string, currentState: string) => void;
  onDrop?: (cardId: string, fromState: string, toState: string) => void;
}

export default function KanbanColumn({ title, state, cards, color, draggable, onDragStart, onDrop }: KanbanColumnProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  return (
    <div className="flex-1 min-w-[250px]">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
          {cards.length}
        </span>
      </div>
      <div
        className={`space-y-2 min-h-[200px] rounded-lg p-2 transition-colors ${
          isDragOver ? 'bg-blue-50 border-2 border-blue-300 border-dashed' : 'bg-gray-50'
        }`}
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
            onDragStart={onDragStart}
          />
        ))}
        {cards.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-8">Sin reactivos</p>
        )}
      </div>
    </div>
  );
}
