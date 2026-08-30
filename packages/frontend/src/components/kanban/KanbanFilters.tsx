'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { api } from '@/lib/api';

// ---------- Types ----------

interface Tecnico {
  id: string;
  name: string;
  email: string;
}

interface FormOption {
  id: string;
  name: string;
  isActive?: boolean;
}

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface KanbanFilterValues {
  tecnicoId: string;
  formId: string;
  dateFrom: string;
  dateTo: string;
  clientSearch: string;
  onlyUnread: boolean;
}

interface KanbanFiltersProps {
  /** Current filter values */
  values: KanbanFilterValues;
  /** Called when any filter changes */
  onChange: (values: KanbanFilterValues) => void;
  /** Hide tecnico filter (e.g., on the tecnico's own board) */
  hideTecnico?: boolean;
  /** Pre-built form options extracted from board data (bypasses API call for forms) */
  formOptions?: FormOption[];
  /** Nombres de cliente extraídos de las tarjetas del board para el dropdown */
  clienteOptions?: string[];
}

// ---------- Component ----------

export default function KanbanFilters({ values, onChange, hideTecnico, formOptions, clienteOptions }: KanbanFiltersProps) {
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [forms, setForms] = useState<FormOption[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);

  // Form options come from board data (unique formNames in the cards)
  useEffect(() => {
    if (formOptions) {
      setForms(formOptions);
    }
  }, [formOptions]);

  // Load technician list on mount (only if needed)
  useEffect(() => {
    if (hideTecnico) return;
    let cancelled = false;
    setLoadingOptions(true);

    const loadTecnicos = async () => {
      try {
        const result = await api<PaginatedResponse<Tecnico>>('/api/users/tecnicos');
        if (cancelled) return;
        const list = Array.isArray(result) ? result : (result.data || []);
        setTecnicos(list);
      } catch {
        // Non-critical
      } finally {
        if (!cancelled) setLoadingOptions(false);
      }
    };

    loadTecnicos();
    return () => { cancelled = true; };
  }, [hideTecnico]);

  const update = useCallback(
    (partial: Partial<KanbanFilterValues>) => {
      onChange({ ...values, ...partial });
    },
    [values, onChange],
  );

  const clearAll = useCallback(() => {
    onChange({
      tecnicoId: '',
      formId: '',
      dateFrom: '',
      dateTo: '',
      clientSearch: '',
      onlyUnread: false,
    });
  }, [onChange]);

  const activeCount = useMemo(() => {
    let count = 0;
    if (values.tecnicoId) count++;
    if (values.formId) count++;
    if (values.dateFrom) count++;
    if (values.dateTo) count++;
    if (values.clientSearch) count++;
    if (values.onlyUnread) count++;
    return count;
  }, [values]);

  return (
    <div className="mb-4">
      {/* Toggle button for mobile / compact */}
      <div className="flex items-center gap-2 md:hidden mb-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          aria-expanded={expanded}
          aria-controls="kanban-filters-panel"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" />
          </svg>
          Filtros
          {activeCount > 0 && (
            <span className="bg-blue-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
              {activeCount}
            </span>
          )}
        </button>
      </div>

      {/* Filter panel — always visible on desktop, toggleable on mobile */}
      <div
        id="kanban-filters-panel"
        className={`${expanded ? 'block' : 'hidden'} md:block`}
      >
        <div className="flex flex-wrap items-end gap-3 p-3 bg-white border border-gray-200 rounded-lg shadow-sm">
          {/* Cliente: dropdown (derivado de las tarjetas del board) */}
          <div className="min-w-[200px]">
            <label htmlFor="kanban-filter-cliente" className="block text-xs font-medium text-gray-500 mb-1">
              Cliente
            </label>
            <select
              id="kanban-filter-cliente"
              value={values.clientSearch}
              onChange={(e) => update({ clientSearch: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
            >
              <option value="">Todos los clientes</option>
              {(clienteOptions || []).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Técnico dropdown */}
          {!hideTecnico && (
            <div className="min-w-[180px]">
              <label htmlFor="kanban-filter-tecnico" className="block text-xs font-medium text-gray-500 mb-1">
                Técnico
              </label>
              <select
                id="kanban-filter-tecnico"
                value={values.tecnicoId}
                onChange={(e) => update({ tecnicoId: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                disabled={loadingOptions}
              >
                <option value="">Todos los técnicos</option>
                {tecnicos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Form dropdown */}
          <div className="min-w-[180px]">
            <label htmlFor="kanban-filter-form" className="block text-xs font-medium text-gray-500 mb-1">
              Formulario
            </label>
            <select
              id="kanban-filter-form"
              value={values.formId}
              onChange={(e) => update({ formId: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
            >
              <option value="">Todos los formularios</option>
              {forms.map((f) => (
                <option key={f.id} value={f.name}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          {/* Date from */}
          <div className="min-w-[140px]">
            <label htmlFor="kanban-filter-from" className="block text-xs font-medium text-gray-500 mb-1">
              Desde
            </label>
            <input
              id="kanban-filter-from"
              type="date"
              value={values.dateFrom}
              onChange={(e) => update({ dateFrom: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          {/* Date to */}
          <div className="min-w-[140px]">
            <label htmlFor="kanban-filter-to" className="block text-xs font-medium text-gray-500 mb-1">
              Hasta
            </label>
            <input
              id="kanban-filter-to"
              type="date"
              value={values.dateTo}
              onChange={(e) => update({ dateTo: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          {/* Unread toggle */}
          <div className="flex items-center gap-2 self-end pb-1">
            <input
              id="kanban-filter-unread"
              type="checkbox"
              checked={values.onlyUnread}
              onChange={(e) => update({ onlyUnread: e.target.checked })}
              className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="kanban-filter-unread" className="text-xs font-medium text-gray-600 whitespace-nowrap">
              Solo con observaciones
            </label>
          </div>

          {/* Clear button */}
          {activeCount > 0 && (
            <button
              onClick={clearAll}
              className="self-end px-3 py-2 text-xs font-medium text-red-600 bg-red-50 rounded-md hover:bg-red-100 transition-colors whitespace-nowrap"
            >
              Limpiar filtros ({activeCount})
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
