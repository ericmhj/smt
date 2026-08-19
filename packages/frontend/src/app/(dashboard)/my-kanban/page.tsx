'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '@/lib/api';
import { extractTenantSlug } from '@/lib/tenant';
import { useAuth } from '@/contexts/AuthContext';
import KanbanColumn from '@/components/kanban/KanbanColumn';
import KanbanFilters, { KanbanFilterValues } from '@/components/kanban/KanbanFilters';
import { KanbanCardData } from '@/components/kanban/KanbanCard';
import EnsayoFormModal from '@/components/kanban/EnsayoFormModal';
import RejectionInfoModal from '@/components/kanban/RejectionInfoModal';
import Toast from '@/components/ui/Toast';

interface KanbanColumnData {
  state: string;
  label: string;
  cards: KanbanCardData[];
}

interface KanbanResponse {
  columns: KanbanColumnData[];
}

interface ReactivoDetail {
  id: string;
  formName?: string;
  responses: Record<string, unknown>;
  rejectionReason: string | null;
  state: string;
  form?: { name: string };
}

interface FormData {
  sanitizedHtml: string;
  jsonSchema: unknown;
  fieldsMetadata: unknown;
}

type ActiveModal = 'none' | 'ensayo' | 'rejection' | 'pdf';

const columnsConfig = [
  { key: 'pendiente', title: 'Programado', color: '#eab308' },
  { key: 'en_revision', title: 'En Evaluación', color: '#3b82f6' },
  { key: 'validado', title: 'Validado', color: '#22c55e' },
  { key: 'rechazado', title: 'Rechazado', color: '#ef4444' },
  { key: 'finalizado', title: 'Finalizado', color: '#6b7280' },
];

export default function MyKanbanPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [data, setData] = useState<KanbanColumnData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<KanbanFilterValues>({
    tecnicoId: '',
    formId: '',
    dateFrom: '',
    dateTo: '',
    clientSearch: '',
    onlyUnread: false,
  });

  // Modal state
  const [activeModal, setActiveModal] = useState<ActiveModal>('none');
  const [activeReactivoId, setActiveReactivoId] = useState<string | null>(null);

  // EnsayoFormModal state
  const [formHtml, setFormHtml] = useState<string>('');
  const [formInitialResponses, setFormInitialResponses] = useState<Record<string, unknown> | undefined>(undefined);
  const [formReadOnly, setFormReadOnly] = useState(false);

  // RejectionInfoModal state
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [rejectionFormName, setRejectionFormName] = useState<string>('');
  const [rejectionResponses, setRejectionResponses] = useState<Record<string, unknown>>({});

  // PDF viewer state
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  // Toast state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const fetchKanban = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('tecnicoId', user.id);
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.set('dateTo', filters.dateTo);
      const result = await api<KanbanResponse>(`/api/kanban?${params.toString()}`);
      setData(result.columns || []);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [user, filters.dateFrom, filters.dateTo]);

  useEffect(() => {
    if (!user || authLoading) return;
    fetchKanban();
  }, [user, authLoading, fetchKanban]);

  // Extract unique form names from board cards for the filter dropdown
  const formOptions = useMemo(() => {
    const seen = new Map<string, boolean>();
    data.forEach((col) => {
      col.cards.forEach((card) => {
        if (!seen.has(card.formName)) {
          seen.set(card.formName, true);
        }
      });
    });
    return Array.from(seen.keys()).map((name) => ({ id: name, name }));
  }, [data]);

  // Client-side filtering (form name, search + unread)
  const filteredData = useMemo(() => {
    return data.map((column) => ({
      ...column,
      cards: column.cards.filter((card) => {
        if (filters.formId && card.formName !== filters.formId) return false;
        if (filters.clientSearch) {
          const search = filters.clientSearch.toLowerCase();
          const matchesClient = card.clienteNombre?.toLowerCase().includes(search);
          const matchesForm = card.formName.toLowerCase().includes(search);
          if (!matchesClient && !matchesForm) return false;
        }
        if (filters.onlyUnread && card.unreadObservations === 0) return false;
        return true;
      }),
    }));
  }, [data, filters.formId, filters.clientSearch, filters.onlyUnread]);

  if (authLoading || !user) return <p className="text-gray-500">Cargando...</p>;

  const handleCardClick = async (cardId: string) => {
    if (activeModal !== 'none' || pdfUrl) return;

    // Find the card to determine its state
    let cardState: string | null = null;
    for (const col of data) {
      const card = col.cards.find((c) => c.id === cardId);
      if (card) {
        cardState = card.state;
        break;
      }
    }

    if (!cardState) return;

    if (cardState === 'pendiente') {
      // Fetch form data and open EnsayoFormModal
      setPdfLoading(true);
      try {
        const [formData, detail] = await Promise.all([
          api<FormData>(`/api/reactivos/${cardId}/form`),
          api<ReactivoDetail>(`/api/reactivos/${cardId}`),
        ]);
        setFormHtml(formData.sanitizedHtml);
        setFormInitialResponses(
          detail.responses && Object.keys(detail.responses).length > 0
            ? detail.responses
            : undefined,
        );
        setActiveReactivoId(cardId);
        setActiveModal('ensayo');
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error de conexión';
        setToast({ message, type: 'error' });
      } finally {
        setPdfLoading(false);
      }
    } else if (cardState === 'rechazado') {
      // Fetch detail and open RejectionInfoModal
      setPdfLoading(true);
      try {
        const detail = await api<ReactivoDetail>(`/api/reactivos/${cardId}`);
        setRejectionReason(detail.rejectionReason || '');
        setRejectionFormName(detail.form?.name || detail.formName || '');
        setRejectionResponses(detail.responses || {});
        setActiveReactivoId(cardId);
        setActiveModal('rejection');
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error de conexión';
        setToast({ message, type: 'error' });
      } finally {
        setPdfLoading(false);
      }
    } else {
      // Other states: open PDF viewer
      setPdfLoading(true);
      try {
        const token = localStorage.getItem('access_token');
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/reactivos/${cardId}/pdf`,
          { headers: { Authorization: `Bearer ${token}`, 'X-Tenant-Slug': extractTenantSlug() } },
        );
        if (res.ok) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          setPdfUrl(url);
          setActiveModal('pdf');
        } else {
          setToast({ message: 'Error al obtener el PDF', type: 'error' });
        }
      } catch {
        setToast({ message: 'Error de conexión', type: 'error' });
      } finally {
        setPdfLoading(false);
      }
    }
  };

  const closeModal = () => {
    setActiveModal('none');
    setActiveReactivoId(null);
    setFormHtml('');
    setFormInitialResponses(undefined);
    setFormReadOnly(false);
  };

  const closePdfViewer = () => {
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
      setPdfUrl(null);
    }
    setActiveModal('none');
  };

  const handleSubmitSuccess = () => {
    closeModal();
    setToast({ message: 'Ensayo enviado exitosamente', type: 'success' });
    fetchKanban();
  };

  const handleReapplySuccess = async (newReactivoId: string, responses: Record<string, unknown>) => {
    // After reapply, open EnsayoFormModal for the new reactivo, pre-filled
    try {
      const formData = await api<FormData>(`/api/reactivos/${newReactivoId}/form`);
      setFormHtml(formData.sanitizedHtml);
      setFormInitialResponses(responses);
      setActiveReactivoId(newReactivoId);
      setActiveModal('ensayo');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error de conexión';
      setToast({ message, type: 'error' });
      closeModal();
    }
  };

  const handleFormClick = async (cardId: string) => {
    if (activeModal !== 'none') return;
    setPdfLoading(true);

    // Find card state
    let cardState: string | null = null;
    for (const col of data) {
      const card = col.cards.find((c) => c.id === cardId);
      if (card) { cardState = card.state; break; }
    }

    // Only editable if state is 'pendiente' AND role is 'tecnico'
    const canEdit = cardState === 'pendiente' && user?.role === 'tecnico';

    try {
      const formData = await api<FormData>(`/api/reactivos/${cardId}/form`).catch(() => null);
      const detail = await api<ReactivoDetail>(`/api/reactivos/${cardId}`);

      if (formData?.sanitizedHtml) {
        setFormHtml(formData.sanitizedHtml);
        setFormInitialResponses(
          detail.responses && Object.keys(detail.responses).length > 0
            ? detail.responses
            : undefined,
        );
        setFormReadOnly(!canEdit);
        setActiveReactivoId(cardId);
        setActiveModal('ensayo');
      } else {
        // Fallback: show responses as read-only
        setRejectionReason('');
        setRejectionFormName(detail.form?.name || detail.formName || '');
        setRejectionResponses(detail.responses || {});
        setActiveReactivoId(cardId);
        setActiveModal('rejection');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error de conexión';
      setToast({ message, type: 'error' });
    } finally {
      setPdfLoading(false);
    }
  };

  const handlePdfClick = async (cardId: string) => {
    if (activeModal !== 'none' || pdfUrl) return;
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
            // Refresh failed — redirect to login
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
        setActiveModal('pdf');
      } else {
        setToast({ message: `Error al generar el PDF (${res.status})`, type: 'error' });
      }
    } catch {
      setToast({ message: 'Error de conexión', type: 'error' });
    } finally {
      setPdfLoading(false);
    }
  };

  const totalCards = filteredData.reduce((sum, col) => sum + col.cards.length, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Mis Ensayos</h1>
        <span className="text-sm text-gray-500">{totalCards} ensayo{totalCards !== 1 ? 's' : ''} asignado{totalCards !== 1 ? 's' : ''}</span>
      </div>

      <KanbanFilters values={filters} onChange={setFilters} hideTecnico formOptions={formOptions} />

      {loading && (
        <p className="text-gray-500 my-4">Cargando tablero...</p>
      )}

      {!loading && totalCards === 0 && (
        <p className="text-sm text-gray-500 mb-4">No tienes ensayos asignados actualmente.</p>
      )}

      {!loading && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {columnsConfig.map((col) => {
            const column = filteredData.find((c) => c.state === col.key);
            return (
              <KanbanColumn
                key={col.key}
                title={col.title}
                state={col.key}
                cards={column?.cards || []}
                color={col.color}
                draggable={false}
                defaultSortField={col.key === 'pendiente' ? 'fechaProgramada' : 'createdAt'}
                defaultSortDirection={col.key === 'pendiente' ? 'asc' : 'desc'}
                onDragStart={() => {}}
                onDrop={() => {}}
                onFormClick={handleFormClick}
                onPdfClick={handlePdfClick}
              />
            );
          })}
        </div>
      )}

      {/* Loading overlay */}
      {pdfLoading && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
            <p className="text-white font-medium">Cargando...</p>
          </div>
        </div>
      )}

      {/* EnsayoFormModal */}
      {activeModal === 'ensayo' && activeReactivoId && (
        <EnsayoFormModal
          reactivoId={activeReactivoId}
          htmlContent={formHtml}
          initialResponses={formInitialResponses}
          readOnly={formReadOnly}
          onClose={closeModal}
          onSubmitSuccess={handleSubmitSuccess}
        />
      )}

      {/* RejectionInfoModal */}
      {activeModal === 'rejection' && activeReactivoId && (
        <RejectionInfoModal
          reactivoId={activeReactivoId}
          rejectionReason={rejectionReason}
          formName={rejectionFormName}
          responses={rejectionResponses}
          onClose={closeModal}
          onReapplySuccess={handleReapplySuccess}
        />
      )}

      {/* PDF Viewer Frame */}
      {activeModal === 'pdf' && pdfUrl && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-2xl w-[90vw] h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="text-sm font-semibold text-gray-700">Visor de PDF</h3>
              <button
                onClick={closePdfViewer}
                className="px-3 py-1 bg-red-50 text-red-600 rounded-md hover:bg-red-100 text-sm font-medium"
              >
                Cerrar PDF
              </button>
            </div>
            <iframe
              src={pdfUrl}
              className="flex-1 w-full"
              title="PDF del ensayo"
            />
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
