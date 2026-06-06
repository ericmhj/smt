'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { stateLabels, stateColors, stateOptions } from '@/lib/states';

interface Ticket {
  id: string;
  clienteNombre: string;
  formNombre: string;
  tecnicoNombre: string | null;
  prioridad: 'alta' | 'media' | 'baja';
  estado: string;
  fechaLimite: string | null;
  createdAt: string;
}

interface TicketsResponse {
  data: Ticket[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function isOverdue(fechaLimite: string | null): boolean {
  if (!fechaLimite) return false;
  return new Date(fechaLimite) < new Date();
}

function isApproaching(fechaLimite: string | null): boolean {
  if (!fechaLimite) return false;
  const deadline = new Date(fechaLimite);
  const now = new Date();
  if (deadline < now) return false;
  const hoursLeft = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);
  return hoursLeft <= 24;
}

export default function TicketsPage() {
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [estado, setEstado] = useState('');
  const [prioridad, setPrioridad] = useState('');
  const [vencido, setVencido] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      if (estado) params.set('estado', estado);
      if (prioridad) params.set('prioridad', prioridad);
      if (vencido) params.set('vencido', vencido);

      const response = await api<TicketsResponse>(`/api/tickets?${params.toString()}`);
      setTickets(response.data || []);
      setTotal(response.total || 0);
    } catch {
      setTickets([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [estado, prioridad, vencido, page]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const totalPages = Math.ceil(total / pageSize);

  const prioridadBadge = (p: string) => {
    switch (p) {
      case 'alta': return 'bg-red-100 text-red-700';
      case 'media': return 'bg-yellow-100 text-yellow-700';
      case 'baja': return 'bg-gray-100 text-gray-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const estadoBadge = (e: string) => {
    return stateColors[e] || 'bg-gray-100 text-gray-800';
  };

  const estadoLabel = (e: string) => {
    return stateLabels[e] || e;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Tickets</h1>
        <Link
          href="/tickets/nuevo"
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Nuevo ticket
        </Link>
      </div>

      <div className="flex flex-wrap gap-4 mb-4">
        <select
          value={estado}
          onChange={(e) => { setEstado(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        >
          <option value="">Todos los estados</option>
          {stateOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <select
          value={prioridad}
          onChange={(e) => { setPrioridad(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        >
          <option value="">Todas las prioridades</option>
          <option value="alta">Alta</option>
          <option value="media">Media</option>
          <option value="baja">Baja</option>
        </select>
        <select
          value={vencido}
          onChange={(e) => { setVencido(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        >
          <option value="">Todos</option>
          <option value="true">Vencidos</option>
          <option value="false">Vigentes</option>
        </select>
      </div>

      {loading ? (
        <p className="text-gray-500">Cargando...</p>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Formulario</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Técnico</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Prioridad</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha Límite</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {tickets.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    No se encontraron tickets
                  </td>
                </tr>
              ) : (
                tickets.map((ticket) => {
                  const isTerminal = ticket.estado === 'validado' || ticket.estado === 'rechazado' || ticket.estado === 'finalizado';
                  const overdue = isOverdue(ticket.fechaLimite) && !isTerminal;
                  const approaching = !overdue && isApproaching(ticket.fechaLimite) && !isTerminal;
                  return (
                    <tr
                      key={ticket.id}
                      onClick={() => router.push(`/tickets/${ticket.id}`)}
                      className={`hover:bg-gray-50 cursor-pointer ${overdue ? 'bg-red-50' : approaching ? 'bg-yellow-50' : ''}`}
                    >
                      <td className="px-4 py-3 text-sm text-gray-900">{ticket.clienteNombre}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{ticket.formNombre}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{ticket.tecnicoNombre || '—'}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`px-2 py-0.5 rounded-full text-xs ${prioridadBadge(ticket.prioridad)}`}>
                          {ticket.prioridad}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`px-2 py-0.5 rounded-full text-xs ${estadoBadge(ticket.estado)}`}>
                          {estadoLabel(ticket.estado)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {ticket.fechaLimite ? (
                          <span className={overdue ? 'text-red-600 font-medium' : approaching ? 'text-yellow-600 font-medium' : 'text-gray-600'}>
                            {new Date(ticket.fechaLimite).toLocaleDateString('es')}
                            {overdue && ' (Vencido)'}
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-600">
            Mostrando {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} de {total}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 text-sm border rounded-md disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1 text-sm border rounded-md disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
