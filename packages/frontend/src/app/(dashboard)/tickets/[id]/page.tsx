'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { stateLabels, stateColors } from '@/lib/states';

interface TicketDetail {
  id: string;
  clienteId: string;
  clienteNombre: string;
  formId: string;
  formNombre: string;
  tecnicoAsignadoId: string | null;
  tecnicoNombre: string | null;
  prioridad: 'alta' | 'media' | 'baja';
  estado: string;
  fechaLimite: string | null;
  reactivoId: string | null;
  createdAt: string;
  updatedAt: string;
  historial: { estado: string; fecha: string; usuarioEmail?: string }[];
}

interface TecnicoOption {
  id: string;
  name: string;
  email: string;
}

const TRANSITIONS: Record<string, string[]> = {
  pendiente: ['en_revision'],
  en_revision: ['validado', 'rechazado'],
  validado: ['finalizado'],
  rechazado: [],
  finalizado: [],
};

export default function TicketDetallePage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const ticketId = params.id as string;

  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tecnicos, setTecnicos] = useState<TecnicoOption[]>([]);
  const [showReassign, setShowReassign] = useState(false);
  const [selectedTecnico, setSelectedTecnico] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchTicket = useCallback(async () => {
    try {
      const data = await api<TicketDetail>(`/api/tickets/${ticketId}`);
      setTicket(data);
    } catch {
      setTicket(null);
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    fetchTicket();
  }, [fetchTicket]);

  useEffect(() => {
    const fetchTecnicos = async () => {
      try {
        const res = await api<{ data: TecnicoOption[] }>('/api/users/tecnicos');
        setTecnicos(res.data || []);
      } catch { /* ignore */ }
    };
    fetchTecnicos();
  }, []);

  const transitionTo = async (nuevoEstado: string) => {
    setActionLoading(true);
    try {
      await api(`/api/tickets/${ticketId}/estado`, {
        method: 'PATCH',
        body: JSON.stringify({ estado: nuevoEstado }),
      });
      fetchTicket();
    } catch { /* ignore */ }
    finally { setActionLoading(false); }
  };

  const reassignTecnico = async () => {
    if (!selectedTecnico) return;
    setActionLoading(true);
    try {
      await api(`/api/tickets/${ticketId}/tecnico`, {
        method: 'PATCH',
        body: JSON.stringify({ tecnicoId: selectedTecnico }),
      });
      setShowReassign(false);
      fetchTicket();
    } catch { /* ignore */ }
    finally { setActionLoading(false); }
  };

  if (loading) return <p className="text-gray-500">Cargando...</p>;
  if (!ticket) return <p className="text-red-600">Ticket no encontrado</p>;

  const availableTransitions = TRANSITIONS[ticket.estado] || [];
  const canReassign = ticket.estado === 'pendiente' && (user?.role === 'manager' || user?.role === 'asistente');

  const prioridadBadge = (p: string) => {
    switch (p) {
      case 'alta': return 'bg-red-100 text-red-700';
      case 'media': return 'bg-yellow-100 text-yellow-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const estadoBadge = (e: string) => {
    return stateColors[e] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Ticket #{ticketId.slice(0, 8)}</h1>
        <button
          onClick={() => router.push('/tickets')}
          className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 text-sm"
        >
          Volver
        </button>
      </div>

      {/* Info Card */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Información del Ticket</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-medium text-gray-600">Cliente:</span>{' '}
            <Link href={`/clientes/${ticket.clienteId}`} className="text-blue-600 hover:underline">
              {ticket.clienteNombre}
            </Link>
          </div>
          <div><span className="font-medium text-gray-600">Formulario:</span> {ticket.formNombre}</div>
          <div><span className="font-medium text-gray-600">Técnico:</span> {ticket.tecnicoNombre || 'Sin asignar'}</div>
          <div>
            <span className="font-medium text-gray-600">Prioridad:</span>{' '}
            <span className={`px-2 py-0.5 rounded-full text-xs ${prioridadBadge(ticket.prioridad)}`}>
              {ticket.prioridad}
            </span>
          </div>
          <div>
            <span className="font-medium text-gray-600">Estado:</span>{' '}
            <span className={`px-2 py-0.5 rounded-full text-xs ${estadoBadge(ticket.estado)}`}>
              {stateLabels[ticket.estado] || ticket.estado}
            </span>
          </div>
          <div>
            <span className="font-medium text-gray-600">Fecha Límite (SLA):</span>{' '}
            {ticket.fechaLimite ? new Date(ticket.fechaLimite).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
          </div>
          <div><span className="font-medium text-gray-600">Creado:</span> {new Date(ticket.createdAt).toLocaleString('es')}</div>
          {ticket.reactivoId && (
            <div>
              <span className="font-medium text-gray-600">Reactivo:</span>{' '}
              <Link href={`/my-reactivos/${ticket.reactivoId}`} className="text-blue-600 hover:underline">
                Ver reactivo
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      {(availableTransitions.length > 0 || canReassign) && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Acciones</h2>
          <div className="flex flex-wrap gap-3">
            {availableTransitions.map((estado) => (
              <button
                key={estado}
                onClick={() => transitionTo(estado)}
                disabled={actionLoading}
                className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                Cambiar a: {stateLabels[estado] || estado}
              </button>
            ))}
            {canReassign && (
              <button
                onClick={() => setShowReassign(!showReassign)}
                className="px-4 py-2 bg-orange-600 text-white rounded-md text-sm hover:bg-orange-700"
              >
                Reasignar técnico
              </button>
            )}
          </div>

          {showReassign && (
            <div className="mt-4 flex gap-3 items-end">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nuevo técnico</label>
                <select
                  value={selectedTecnico}
                  onChange={(e) => setSelectedTecnico(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                >
                  <option value="">Seleccionar...</option>
                  {tecnicos.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={reassignTecnico}
                disabled={!selectedTecnico || actionLoading}
                className="px-4 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700 disabled:opacity-50"
              >
                Confirmar
              </button>
            </div>
          )}
        </div>
      )}

      {/* Timeline */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Historial de Estados</h2>
        {ticket.historial && ticket.historial.length > 0 ? (
          <div className="space-y-3">
            {ticket.historial.map((entry, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-2 h-2 mt-2 rounded-full bg-blue-500 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-gray-800">
                    Estado: <span className="capitalize">{stateLabels[entry.estado] || entry.estado}</span>
                  </p>
                  <p className="text-gray-500">
                    {new Date(entry.fecha).toLocaleString('es')}
                    {entry.usuarioEmail && ` — ${entry.usuarioEmail}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">Sin historial registrado</p>
        )}
      </div>
    </div>
  );
}
