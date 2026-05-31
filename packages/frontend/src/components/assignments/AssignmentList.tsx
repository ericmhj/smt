'use client';

import type { Assignment } from '@/app/(dashboard)/assignments/page';

interface AssignmentListProps {
  assignments: Assignment[];
  onRevoke: (id: string) => void;
}

export default function AssignmentList({ assignments, onRevoke }: AssignmentListProps) {
  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Técnico</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Formulario</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {assignments.map((a) => (
            <tr key={a.id}>
              <td className="px-4 py-3 text-sm text-gray-900">{a.userName}</td>
              <td className="px-4 py-3 text-sm text-gray-500">{a.formName}</td>
              <td className="px-4 py-3 text-sm text-gray-500">
                {new Date(a.assignedAt).toLocaleDateString('es')}
              </td>
              <td className="px-4 py-3">
                <button
                  onClick={() => onRevoke(a.id)}
                  className="text-red-600 hover:text-red-800 text-sm"
                >
                  Revocar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {assignments.length === 0 && (
        <p className="text-center text-gray-500 py-8">No hay asignaciones activas.</p>
      )}
    </div>
  );
}
