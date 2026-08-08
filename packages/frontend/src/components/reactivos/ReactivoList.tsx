'use client';

import { useState } from 'react';
import Link from 'next/link';
import { extractTenantSlug } from '@/lib/tenant';
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

import { stateLabels, stateColors } from '@/lib/states';

export default function ReactivoList({ reactivos, onReapply }: ReactivoListProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const handleViewPdf = async (reactivoId: string) => {
    if (pdfUrl) return; // Block if already viewing
    setPdfLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`http://localhost:3001/api/reactivos/${reactivoId}/pdf`, {
        headers: { Authorization: `Bearer ${token}`, 'X-Tenant-Slug': extractTenantSlug() },
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        setPdfUrl(url);
      } else {
        alert('Error al obtener el PDF');
      }
    } catch {
      alert('Error de conexión');
    } finally {
      setPdfLoading(false);
    }
  };

  const closePdfViewer = () => {
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
      setPdfUrl(null);
    }
  };

  if (reactivos.length === 0) {
    return <p className="text-gray-500 text-center py-8">No tienes ensayos.</p>;
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
              onClick={() => handleViewPdf(r.id)}
              disabled={!!pdfUrl}
              className="text-xs text-green-600 hover:text-green-800 disabled:opacity-50"
            >
              Ver documento enviado
            </button>
            {r.state === 'rechazado' && r.formId && (
              <ReapplyButton assignmentId={r.formId} onSuccess={onReapply} />
            )}
          </div>
        </div>
      ))}

      {/* PDF Loading overlay */}
      {pdfLoading && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
            <p className="text-white font-medium">Cargando documento...</p>
          </div>
        </div>
      )}

      {/* PDF Viewer Frame */}
      {pdfUrl && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-2xl w-[90vw] h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="text-sm font-semibold text-gray-700">Documento enviado</h3>
              <button
                onClick={closePdfViewer}
                className="px-3 py-1 bg-red-50 text-red-600 rounded-md hover:bg-red-100 text-sm font-medium"
              >
                Cerrar documento
              </button>
            </div>
            <iframe
              src={pdfUrl}
              className="flex-1 w-full"
              title="Documento del ensayo"
            />
          </div>
        </div>
      )}
    </div>
  );
}
