'use client';

export interface KanbanCardData {
  id: string;
  tecnicoName: string;
  formName: string;
  attemptNumber: number;
  unreadObservations: number;
  createdAt: string;
  state: string;
}

interface KanbanCardProps {
  card: KanbanCardData;
  draggable?: boolean;
  onCardClick?: (cardId: string) => void;
}

export default function KanbanCard({ card, draggable, onCardClick }: KanbanCardProps) {
  return (
    <div
      draggable={draggable || false}
      onDragStart={(e) => {
        e.dataTransfer.setData('cardId', card.id);
        e.dataTransfer.setData('fromState', card.state);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={(e) => {
        // Don't trigger click if dragging
        if (e.defaultPrevented) return;
        onCardClick?.(card.id);
      }}
      className={`bg-white rounded-md shadow-sm border border-gray-200 p-3 hover:shadow-md transition-shadow select-none ${
        draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
      }`}
    >
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-gray-800 truncate">{card.formName}</p>
        {card.unreadObservations > 0 && (
          <span className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0 mt-1" />
        )}
      </div>
      <p className="text-xs text-gray-500 mt-1">{card.tecnicoName}</p>
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-gray-400">Intento #{card.attemptNumber}</span>
        <span className="text-xs text-gray-400">
          {new Date(card.createdAt).toLocaleDateString('es')}
        </span>
      </div>
    </div>
  );
}
