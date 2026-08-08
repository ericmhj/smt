'use client';

import { useState, useEffect } from 'react';
import { api, apiUpload } from '@/lib/api';
import { extractTenantSlug } from '@/lib/tenant';
import { useAuth } from '@/contexts/AuthContext';
import KanbanColumn from './KanbanColumn';
import TransitionDialog from './TransitionDialog';
import { KanbanCardData } from './KanbanCard';

interface KanbanColumnData {
  state: string;
  label: string;
  cards: KanbanCardData[];
}

interface KanbanResponse {
  columns: KanbanColumnData[];
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  pendiente: ['en_revision'],
  en_revision: ['validado', 'rechazado'],
  validado: ['finalizado'],
  rechazado: [],
  finalizado: [],
};

const columnsConfig = [
  { key: 'pendiente', title: 'Programado', color: '#eab308' },
  { key: 'en_revision', title: 'En Evaluación', color: '#3b82f6' },
  { key: 'validado', title: 'Validado', color: '#22c55e' },
  { key: 'rechazado', title: 'Rechazado', color: '#ef4444' },
  { key: 'finalizado', title: 'Finalizado', color: '#6b7280' },
];

export default function KanbanBoard() {
  const { user } = useAuth();
  const [data, setData] = useState<KanbanColumnData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTechnician, setFilterTechnician] = useState('');
  const [filterForm, setFilterForm] = useState('');

  // Transition dialog state
  const [showTransition, setShowTransition] = useState(false);
  const [transitionCardId, setTransitionCardId] = useState('');
  const [transitionFromState, setTransitionFromState] = useState('');
  const [transitionToState, setTransitionToState] = useState('');
  const [transitioning, setTransitioning] = useState(false);
  const [transitionError, setTransitionError] = useState('');

  const isManager = true; // All roles can attempt drag, backend validates permissions

  const fetchKanban = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterTechnician) params.set('tecnicoId', filterTechnician);
      if (filterForm) params.set('formId', filterForm);
      const token = localStorage.getItem('access_token');
      const tenantSlug = extractTenantSlug();
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/kanban?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Tenant-Slug': tenantSlug,
        },
      });
      if (!response.ok) throw new Error('Failed');
      const result = await response.json();
      setData(result.columns || []);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKanban();
  }, [filterTechnician, filterForm]);

  const handleDrop = (cardId: string, fromState: string, toState: string) => {
    // Check if transition is valid
    const validTargets = VALID_TRANSITIONS[fromState] || [];
    if (!validTargets.includes(toState)) {
      setTransitionError(`No se puede mover de "${fromState}" a "${toState}". Solo se permiten transiciones hacia adelante.`);
      setTimeout(() => setTransitionError(''), 4000);
      return;
    }

    // Open transition dialog
    setTransitionCardId(cardId);
    setTransitionFromState(fromState);
    setTransitionToState(toState);
    setShowTransition(true);
  };

  const handleConfirmTransition = async (targetState: string, signatureId: string, reason?: string) => {
    setTransitioning(true);
    try {
      await api(`/api/kanban/${transitionCardId}/transition`, {
        method: 'POST',
        body: JSON.stringify({ toState: targetState, signatureId, reason }),
      });
      setShowTransition(false);
      setTransitionError('');
      fetchKanban(); // Refresh board
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error en la transición');
    } finally {
      setTransitioning(false);
    }
  };

  // PDF viewer state
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  // Form viewer state
  const [formHtml, setFormHtml] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  const handleFormClick = async (cardId: string) => {
    setFormLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      // Try detail endpoint (accessible by all roles)
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/reactivos/${cardId}`, {
        headers: { Authorization: `Bearer ${token}`, 'X-Tenant-Slug': extractTenantSlug() },
      });
      if (res.ok) {
        const detail = await res.json();
        const responses = detail.responses || {};
        const rows = Object.entries(responses)
          .map(([key, val]) => `<tr><td style="padding:8px 12px;font-weight:600;color:#475569;border-bottom:1px solid #f1f5f9;background:#f8fafc;width:35%;">${key.replace(/_/g, ' ')}</td><td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;">${val ?? '—'}</td></tr>`)
          .join('');
        const html = `
          <div style="font-family:'Segoe UI',sans-serif;max-width:800px;margin:0 auto;">
            <div style="border-bottom:2px solid #2563eb;padding-bottom:10px;margin-bottom:20px;">
              <h2 style="margin:0;color:#2563eb;font-size:18px;">${detail.formName || 'Formulario'}</h2>
              <p style="margin:4px 0 0;color:#64748b;font-size:13px;">Técnico: ${detail.tecnicoName || 'N/A'} • Estado: ${detail.state} • Intento #${detail.attemptNumber || 1}</p>
            </div>
            <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;">
              ${rows || '<tr><td style="padding:20px;text-align:center;color:#94a3b8;">Sin respuestas registradas</td></tr>'}
            </table>
          </div>`;
        setFormHtml(html);
      } else {
        const errorData = await res.json().catch(() => ({}));
        alert(`Error ${res.status}: ${errorData.message || 'No se pudo obtener el formulario'}`);
      }
    } catch (err) {
      alert('Error de conexión al obtener el formulario');
    } finally {
      setFormLoading(false);
    }
  };

  const handlePdfClick = async (cardId: string) => {
    setPdfLoading(true);

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    const tenantSlug = extractTenantSlug();

    const fetchPdf = async (token: string) => {
      return fetch(`${apiUrl}/api/reactivos/${cardId}/pdf`, {
        headers: { Authorization: `Bearer ${token}`, 'X-Tenant-Slug': tenantSlug },
      });
    };

    try {
      let token = localStorage.getItem('access_token') || '';
      let res = await fetchPdf(token);

      // If 401, attempt token refresh and retry
      if (res.status === 401) {
        const refreshToken = localStorage.getItem('refresh_token');
        if (refreshToken) {
          const refreshRes = await fetch(`${apiUrl}/api/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Tenant-Slug': tenantSlug },
            body: JSON.stringify({ refreshToken }),
          });
          if (refreshRes.ok) {
            const data = await refreshRes.json();
            localStorage.setItem('access_token', data.accessToken);
            if (data.refreshToken) localStorage.setItem('refresh_token', data.refreshToken);
            document.cookie = `sgr-token=${encodeURIComponent(data.accessToken)}; path=/; SameSite=Lax`;
            token = data.accessToken;
            res = await fetchPdf(token);
          } else {
            window.location.href = '/login';
            return;
          }
        } else {
          window.location.href = '/login';
          return;
        }
      }

      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        setPdfUrl(url);
      } else {
        const errorData = await res.json().catch(() => ({}));
        alert(`Error ${res.status}: ${errorData.message || 'No se pudo generar el PDF'}`);
      }
    } catch {
      alert('Error de conexión al generar el PDF');
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

  const closeFormViewer = () => {
    setFormHtml(null);
  };

  if (loading) return <p className="text-gray-500">Cargando tablero...</p>;

  return (
    <div>
      {transitionError && (
        <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md mb-4 flex items-center justify-between">
          <span>{transitionError}</span>
          <button onClick={() => setTransitionError('')} className="text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      <div className="flex gap-4 mb-4">
        <input
          type="text"
          placeholder="Filtrar por técnico (UUID)..."
          value={filterTechnician}
          onChange={(e) => setFilterTechnician(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        />
        <input
          type="text"
          placeholder="Filtrar por formulario (UUID)..."
          value={filterForm}
          onChange={(e) => setFilterForm(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        />
        {isManager && (
          <p className="text-xs text-blue-600 self-center">💡 Arrastra tarjetas entre columnas para cambiar estado</p>
        )}
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {columnsConfig.map((col) => {
          const column = data.find((c) => c.state === col.key);
          return (
            <KanbanColumn
              key={col.key}
              title={col.title}
              state={col.key}
              cards={column?.cards || []}
              color={col.color}
              draggable={isManager}
              onDragStart={() => {}}
              onDrop={handleDrop}
              onFormClick={handleFormClick}
              onPdfClick={handlePdfClick}
            />
          );
        })}
      </div>

      {showTransition && (
        <TransitionDialog
          currentState={transitionFromState}
          availableStates={[transitionToState]}
          onConfirm={handleConfirmTransition}
          onCancel={() => setShowTransition(false)}
          loading={transitioning}
        />
      )}

      {/* PDF Loading overlay */}
      {(pdfLoading || formLoading) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
            <p className="text-white font-medium">
              {pdfLoading ? 'Cargando PDF...' : 'Cargando formulario...'}
            </p>
          </div>
        </div>
      )}

      {/* PDF Viewer Frame */}
      {pdfUrl && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-2xl w-[90vw] h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="text-sm font-semibold text-gray-700">📄 Reporte PDF</h3>
              <button
                onClick={closePdfViewer}
                className="px-3 py-1 bg-red-50 text-red-600 rounded-md hover:bg-red-100 text-sm font-medium"
              >
                Cerrar
              </button>
            </div>
            <iframe
              src={pdfUrl}
              className="flex-1 w-full"
              title="Reporte PDF del ensayo"
            />
          </div>
        </div>
      )}

      {/* Form Viewer Frame */}
      {formHtml && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-2xl w-[90vw] h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="text-sm font-semibold text-gray-700">📋 Formulario Completado</h3>
              <button
                onClick={closeFormViewer}
                className="px-3 py-1 bg-red-50 text-red-600 rounded-md hover:bg-red-100 text-sm font-medium"
              >
                Cerrar
              </button>
            </div>
            <div
              className="flex-1 overflow-auto p-6"
              dangerouslySetInnerHTML={{ __html: formHtml }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
