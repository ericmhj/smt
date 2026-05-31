'use client';

import KanbanBoard from '@/components/kanban/KanbanBoard';

export default function KanbanPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Tablero Kanban</h1>
      <KanbanBoard />
    </div>
  );
}
