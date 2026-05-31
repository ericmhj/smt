'use client';

import KanbanCard, { KanbanCardData } from './KanbanCard';

interface KanbanColumnProps {
  title: string;
  state: string;
  cards: KanbanCardData[];
  color: string;
}

export default function KanbanColumn({ title, cards, color }: KanbanColumnProps) {
  return (
    <div className="flex-1 min-w-[250px]">
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-3 h-3 rounded-full`} style={{ backgroundColor: color }} />
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
          {cards.length}
        </span>
      </div>
      <div className="space-y-2 min-h-[200px] bg-gray-50 rounded-lg p-2">
        {cards.map((card) => (
          <KanbanCard key={card.id} card={card} />
        ))}
        {cards.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-8">Sin reactivos</p>
        )}
      </div>
    </div>
  );
}
