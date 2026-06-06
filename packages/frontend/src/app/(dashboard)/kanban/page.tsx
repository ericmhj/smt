'use client';

import KanbanBoard from '@/components/kanban/KanbanBoard';

export default function KanbanPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Estado de los Ensayos</h1>
      <KanbanBoard />
    </div>
  );
}
