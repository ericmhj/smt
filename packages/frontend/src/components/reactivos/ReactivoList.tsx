'use client';

import Link from 'next/link';
import ReapplyButton from './ReapplyButton';

export interface ReactivoItem {
  id: string;
  formName: string;
  state: string;
  attemptNumber: number;
  createdAt: string;
  rejectionReason?: string;
  formId?: string;
}

interface ReactivoListProps {
  reactivos: ReactivoItem[];
  onReapply?: () => void;
}

const stateLabels: Record<string, string> = {
  pendiente: 'Pendiente',
  en_revision: 'En revisión',
  validado: 'Validado',
  rechazado: 'Rechazado',
  finalizado: 'Finalizado',
};

const stateColors: Record<string, string> = {
  pendiente: 'bg-yellow-100 text-yellow-800',
  en_revision: 'bg-blue-100 text-blue-800',
  validado: 'bg-green-100 text-green-800',
  rechazado: 'bg-red-100 text-red-800',
  finalizado: 'bg-gray-100 text-gray-800',
};

export default function ReactivoList({ reactivos, onReapply }: ReactivoListProps) {
  if (reactivos.length === 0) {
    return <p className="text-gray-500 text-center py-8">No tienes reactivos.</p>;
  }

  return (
    <div className="space-y-3">
      {reactivos.map((r) => (
        <div key={r.id} className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-gray-800">{r.formName}</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Intento #{r.attemptNumber} • {new Date(r.createdAt).toLocaleDateString('es')}
              </p>
            </div>
            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${stateColors[r.state] || 'bg-gray-100 text-gray-800'}`}>
              {stateLabels[r.state] || r.state}
            </span>
          </div>

          {r.state === 'rechazado' && r.rejectionReason && (
            <div className="mt-2 bg-red-50 border border-red-100 rounded-md p-2">
              <p className="text-xs text-red-700">
                <span className="font-medium">Motivo:</span> {r.rejectionReason}
              </p>
            </div>
          )}

          <div className="flex items-center gap-2 mt-3">
            <Link
              href={`/my-reactivos/${r.id}`}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              Ver detalle
            </Link>
            <button
              onClick={async () => {
                const token = localStorage.getItem('access_token');
                const res = await fetch(`http://localhost:3001/api/reactivos/${r.id}/pdf`, {
                  headers: { Authorization: `Bearer ${token}` },
                });
                if (res.ok) {
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `reactivo-${r.id}.pdf`;
                  a.click();
                  URL.revokeObjectURL(url);
                } else {
                  alert('Error al descargar PDF');
                }
              }}
              className="text-xs text-green-600 hover:text-green-800"
            >
              Descargar PDF
            </button>
            {r.state === 'rechazado' && r.formId && (
              <ReapplyButton assignmentId={r.formId} onSuccess={onReapply} />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
