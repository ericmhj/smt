'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { stateLabels, stateColors, stateOptions } from '@/lib/states';

interface Ticket {
  id: string;
  identificador: string;
  clienteNombre: string;
  formNombre: string;
  tecnicoNombre: string | null;
  prioridad: 'alta' | 'media' | 'baja';
  estado: string;
  fechaLimite: string | null;
  fechaProgramada: string | null;
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

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function TicketsPage() {
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  // Filter options loaded from dedicated endpoint (all tickets, not just current page)
  const [filterOptions, setFilterOptions] = useState<{
    clientes: Array<{ id: string; nombre: string }>;
    tecnicos: Array<{ id: string; nombre: string }>;
    formularios: Array<{ id: string; nombre: string }>;
    estados: string[];
    prioridades: string[];
  }>({ clientes: [], tecnicos: [], formularios: [], estados: [], prioridades: [] });

  const clienteOptions = filterOptions.clientes.map((c) => c.nombre).sort();
  const formularioOptions = filterOptions.formularios.map((f) => f.nombre).sort();
  const tecnicoOptions = filterOptions.tecnicos.map((t) => t.nombre).sort();

  // Column filters
  const [filterCliente, setFilterCliente] = useState('');
  const [filterFormulario, setFilterFormulario] = useState('');
  const [filterTecnico, setFilterTecnico] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [filterFechaLimiteDesde, setFilterFechaLimiteDesde] = useState('');
  const [filterFechaLimiteHasta, setFilterFechaLimiteHasta] = useState('');
  const [filterCreatedDesde, setFilterCreatedDesde] = useState('');
  const [filterCreatedHasta, setFilterCreatedHasta] = useState('');
  const [filterProgramadaDesde, setFilterProgramadaDesde] = useState('');
  const [filterProgramadaHasta, setFilterProgramadaHasta] = useState('');

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      if (filterEstado) params.set('estado', filterEstado);
      if (filterCreatedDesde) params.set('fechaDesde', filterCreatedDesde);
      if (filterCreatedHasta) params.set('fechaHasta', filterCreatedHasta);
      // Server-side filters for dropdowns
      const selectedCliente = filterOptions.clientes.find((c) => c.nombre === filterCliente);
      if (selectedCliente) params.set('clienteId', selectedCliente.id);
      const selectedTecnico = filterOptions.tecnicos.find((t) => t.nombre === filterTecnico);
      if (selectedTecnico) params.set('tecnicoAsignadoId', selectedTecnico.id);

      const response = await api<TicketsResponse>(`/api/tickets?${params.toString()}`);
      setTickets(response.data || []);
      setTotal(response.total || 0);
    } catch {
      setTickets([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [filterEstado, filterCreatedDesde, filterCreatedHasta, filterCliente, filterTecnico, filterOptions, page]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  // Load filter options once on mount
  useEffect(() => {
    api<typeof filterOptions>('/api/tickets/filters')
      .then(setFilterOptions)
      .catch(() => {});
  }, []);

  // Client-side filtering for columns not supported server-side
  const filteredTickets = tickets.filter((t) => {
    if (filterFormulario && t.formNombre !== filterFormulario) return false;

    // Date filters: compare using start/end of day to avoid timezone offset issues
    // If ticket has no date for that field, it always passes
    if (filterFechaLimiteDesde && t.fechaLimite) {
      if (t.fechaLimite < filterFechaLimiteDesde + 'T00:00:00') return false;
    }
    if (filterFechaLimiteHasta && t.fechaLimite) {
      if (t.fechaLimite > filterFechaLimiteHasta + 'T23:59:59.999') return false;
    }
    if (filterProgramadaDesde && t.fechaProgramada) {
      if (t.fechaProgramada < filterProgramadaDesde + 'T00:00:00') return false;
    }
    if (filterProgramadaHasta && t.fechaProgramada) {
      if (t.fechaProgramada > filterProgramadaHasta + 'T23:59:59.999') return false;
    }

    return true;
  });

  const totalPages = Math.ceil(total / pageSize);

  const prioridadBadge = (p: string) => {
    switch (p) {
      case 'alta': return 'bg-red-100 text-red-700';
      case 'media': return 'bg-yellow-100 text-yellow-700';
      case 'baja': return 'bg-gray-100 text-gray-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const estadoBadge = (e: string) => stateColors[e] || 'bg-gray-100 text-gray-800';
  const estadoLabel = (e: string) => stateLabels[e] || e;

  const clearFilters = () => {
    setFilterCliente('');
    setFilterFormulario('');
    setFilterTecnico('');
    setFilterEstado('');
    setFilterFechaLimiteDesde('');
    setFilterFechaLimiteHasta('');
    setFilterCreatedDesde('');
    setFilterCreatedHasta('');
    setFilterProgramadaDesde('');
    setFilterProgramadaHasta('');
    setPage(1);
  };

  const hasActiveFilters = filterCliente || filterFormulario || filterTecnico || filterEstado ||
    filterFechaLimiteDesde || filterFechaLimiteHasta || filterCreatedDesde || filterCreatedHasta ||
    filterProgramadaDesde || filterProgramadaHasta;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Tickets</h1>
        <div className="flex items-center gap-3">
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Limpiar filtros
            </button>
          )}
          <Link
            href="/tickets/nuevo"
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
          >
            + Nuevo ticket
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow border border-gray-200 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Formulario</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Técnico</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Prioridad</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">F. Límite</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">F. Creación</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">F. Programación</th>
              </tr>
              {/* Filter row */}
              <tr className="bg-gray-50/50 border-t border-gray-100">
                <th className="px-3 py-2">
                  {/* ID — no filter */}
                </th>
                <th className="px-3 py-2">
                  <select
                    value={filterCliente}
                    onChange={(e) => { setFilterCliente(e.target.value); setPage(1); }}
                    className="w-full px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                  >
                    <option value="">Todos</option>
                    {clienteOptions.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </th>
                <th className="px-3 py-2">
                  <select
                    value={filterFormulario}
                    onChange={(e) => { setFilterFormulario(e.target.value); }}
                    className="w-full px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                  >
                    <option value="">Todos</option>
                    {formularioOptions.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </th>
                <th className="px-3 py-2">
                  <select
                    value={filterTecnico}
                    onChange={(e) => { setFilterTecnico(e.target.value); setPage(1); }}
                    className="w-full px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                  >
                    <option value="">Todos</option>
                    {tecnicoOptions.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </th>
                <th className="px-3 py-2">
                  {/* Prioridad — no filter needed per request */}
                </th>
                <th className="px-3 py-2">
                  <select
                    value={filterEstado}
                    onChange={(e) => { setFilterEstado(e.target.value); setPage(1); }}
                    className="w-full px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                  >
                    <option value="">Todos</option>
                    {stateOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </th>
                <th className="px-3 py-2">
                  <div className="flex flex-col gap-1">
                    <input
                      type="date"
                      value={filterFechaLimiteDesde}
                      onChange={(e) => setFilterFechaLimiteDesde(e.target.value)}
                      className="w-full px-1 py-0.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                      title="Desde"
                    />
                    <input
                      type="date"
                      value={filterFechaLimiteHasta}
                      onChange={(e) => setFilterFechaLimiteHasta(e.target.value)}
                      className="w-full px-1 py-0.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                      title="Hasta"
                    />
                  </div>
                </th>
                <th className="px-3 py-2">
                  <div className="flex flex-col gap-1">
                    <input
                      type="date"
                      value={filterCreatedDesde}
                      onChange={(e) => { setFilterCreatedDesde(e.target.value); setPage(1); }}
                      className="w-full px-1 py-0.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                      title="Desde"
                    />
                    <input
                      type="date"
                      value={filterCreatedHasta}
                      onChange={(e) => { setFilterCreatedHasta(e.target.value); setPage(1); }}
                      className="w-full px-1 py-0.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                      title="Hasta"
                    />
                  </div>
                </th>
                <th className="px-3 py-2">
                  <div className="flex flex-col gap-1">
                    <input
                      type="date"
                      value={filterProgramadaDesde}
                      onChange={(e) => setFilterProgramadaDesde(e.target.value)}
                      className="w-full px-1 py-0.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                      title="Desde"
                    />
                    <input
                      type="date"
                      value={filterProgramadaHasta}
                      onChange={(e) => setFilterProgramadaHasta(e.target.value)}
                      className="w-full px-1 py-0.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                      title="Hasta"
                    />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredTickets.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                    No se encontraron tickets
                  </td>
                </tr>
              ) : (
                filteredTickets.map((ticket) => {
                  const isTerminal = ticket.estado === 'validado' || ticket.estado === 'rechazado' || ticket.estado === 'finalizado';
                  const overdue = isOverdue(ticket.fechaLimite) && !isTerminal;
                  const approaching = !overdue && isApproaching(ticket.fechaLimite) && !isTerminal;
                  return (
                    <tr
                      key={ticket.id}
                      onClick={() => router.push(`/tickets/${ticket.id}`)}
                      className={`hover:bg-gray-50 cursor-pointer transition-colors ${overdue ? 'bg-red-50' : approaching ? 'bg-yellow-50' : ''}`}
                    >
                      <td className="px-3 py-3 text-sm text-gray-500 font-mono">{ticket.identificador || '—'}</td>
                      <td className="px-3 py-3 text-sm text-gray-900 font-medium">{ticket.clienteNombre}</td>
                      <td className="px-3 py-3 text-sm text-gray-600">{ticket.formNombre}</td>
                      <td className="px-3 py-3 text-sm text-gray-600">{ticket.tecnicoNombre || '—'}</td>
                      <td className="px-3 py-3 text-sm">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${prioridadBadge(ticket.prioridad)}`}>
                          {ticket.prioridad}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-sm">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${estadoBadge(ticket.estado)}`}>
                          {estadoLabel(ticket.estado)}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-sm">
                        {ticket.fechaLimite ? (
                          <span className={overdue ? 'text-red-600 font-medium' : approaching ? 'text-yellow-600 font-medium' : 'text-gray-600'}>
                            {formatDate(ticket.fechaLimite)}
                            {overdue && <span className="ml-1 text-[10px] bg-red-100 text-red-700 px-1 rounded">Vencido</span>}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-600">{formatDate(ticket.createdAt)}</td>
                      <td className="px-3 py-3 text-sm text-gray-600">{formatDate(ticket.fechaProgramada)}</td>
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
              className="px-3 py-1 text-sm border border-gray-300 rounded-md disabled:opacity-50 hover:bg-gray-50"
            >
              ← Anterior
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1 text-sm border border-gray-300 rounded-md disabled:opacity-50 hover:bg-gray-50"
            >
              Siguiente →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
