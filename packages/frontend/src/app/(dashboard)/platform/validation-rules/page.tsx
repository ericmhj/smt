'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { createColumnHelper } from '@tanstack/react-table';
import DataTable from '@/components/ui/DataTable';

interface RuleSection {
  sectionName: string;
  pattern: string;
  patternConfig: Record<string, unknown>;
  fieldOverrides?: Array<{ fieldName: string; transferFunction: string; config: Record<string, unknown> }>;
}

interface ValidationRule {
  id: string;
  formType: string;
  name: string;
  description: string | null;
  isActive: boolean;
  sections: RuleSection[];
  createdAt: string;
}

const PATTERN_LABELS: Record<string, string> = {
  identity: 'Identidad',
  required_all: 'Todos obligatorios',
  numeric_range: 'Rango numérico',
  readonly: 'Solo lectura',
  conditional: 'Condicional',
};

export default function ValidationRulesPage() {
  const [rules, setRules] = useState<ValidationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterFormType, setFilterFormType] = useState('');
  const [formTypes, setFormTypes] = useState<string[]>([]);

  useEffect(() => {
    api<Array<{ formType: string }>>('/api/form-templates/all')
      .then((templates) => {
        const types = [...new Set(templates.map((t) => t.formType))];
        setFormTypes(types);
      })
      .catch(() => {});
  }, []);

  const fetchRules = async () => {
    setLoading(true);
    try {
      const url = filterFormType
        ? `/api/validation-rules?form_type=${filterFormType}`
        : '/api/validation-rules';
      const data = await api<ValidationRule[]>(url);
      setRules(data);
    } catch (error) {
      console.error('Error fetching validation rules:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRules(); }, [filterFormType]);

  const handleToggle = async (id: string) => {
    try {
      await api(`/api/validation-rules/${id}/toggle`, { method: 'PATCH' });
      await fetchRules();
    } catch (error) {
      console.error('Error toggling rule:', error);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`¿Eliminar la regla "${name}"?`)) return;
    try {
      await api(`/api/validation-rules/${id}`, { method: 'DELETE' });
      await fetchRules();
    } catch (error) {
      console.error('Error deleting rule:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reglas de Validación</h1>
          <p className="text-sm text-gray-500 mt-1">Reglas globales aplicadas automáticamente por tipo de formulario</p>
        </div>
        <Link
          href={filterFormType ? `/platform/validation-rules/nuevo?form_type=${filterFormType}` : '/platform/validation-rules/nuevo'}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          Nueva Regla
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-500">Cargando...</div>
      ) : (
        <RulesDataTable rules={rules} onToggle={handleToggle} onDelete={handleDelete} />
      )}
    </div>
  );
}

// ─── DataTable sub-component ─────────────────────────────────────────────────

const ruleColumnHelper = createColumnHelper<ValidationRule>();

function RulesDataTable({
  rules,
  onToggle,
  onDelete,
}: {
  rules: ValidationRule[];
  onToggle: (id: string) => void;
  onDelete: (id: string, name: string) => void;
}) {
  const columns = useMemo(() => [
    ruleColumnHelper.accessor('formType', {
      header: 'Tipo',
      cell: (info) => (
        <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-800">
          {info.getValue()}
        </span>
      ),
    }),
    ruleColumnHelper.accessor('name', {
      header: 'Nombre',
      cell: (info) => {
        const r = info.row.original;
        return (
          <div>
            <div className="font-medium text-gray-900">{info.getValue()}</div>
            {r.description && <div className="text-xs text-gray-500">{r.description}</div>}
          </div>
        );
      },
    }),
    ruleColumnHelper.display({
      id: 'secciones',
      header: 'Secciones',
      enableColumnFilter: true,
      filterFn: (row, _columnId, filterValue) => {
        const sections = row.original.sections.map(s => s.sectionName).join(' ');
        return sections.toLowerCase().includes(filterValue.toLowerCase());
      },
      cell: (info) => {
        const r = info.row.original;
        return (
          <div className="flex flex-wrap gap-1">
            {r.sections.map((s, i) => (
              <span key={i} className="inline-flex px-1.5 py-0.5 text-xs rounded bg-gray-100 text-gray-700">
                {s.sectionName}: {PATTERN_LABELS[s.pattern] || s.pattern}
                {s.fieldOverrides && s.fieldOverrides.length > 0 && (
                  <span className="ml-1 text-gray-400">+{s.fieldOverrides.length}</span>
                )}
              </span>
            ))}
          </div>
        );
      },
    }),
    ruleColumnHelper.accessor('isActive', {
      header: 'Estado',
      filterFn: (row, _columnId, filterValue) => {
        const label = row.original.isActive ? 'activa' : 'inactiva';
        return label.startsWith(filterValue.toLowerCase());
      },
      cell: (info) => {
        const r = info.row.original;
        return (
          <button
            onClick={() => onToggle(r.id)}
            className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full cursor-pointer transition-colors ${
              r.isActive ? 'bg-green-100 text-green-800 hover:bg-green-200' : 'bg-red-100 text-red-800 hover:bg-red-200'
            }`}
          >
            {r.isActive ? 'Activa' : 'Inactiva'}
          </button>
        );
      },
    }),
    ruleColumnHelper.display({
      id: 'acciones',
      header: 'Acciones',
      enableSorting: false,
      enableColumnFilter: false,
      cell: (info) => {
        const r = info.row.original;
        return (
          <div className="space-x-2">
            <Link href={`/platform/validation-rules/editar/${r.id}`} className="text-blue-600 hover:text-blue-800">Editar</Link>
            <button onClick={() => onDelete(r.id, r.name)} className="text-red-600 hover:text-red-800">Eliminar</button>
          </div>
        );
      },
    }),
  ], [onToggle, onDelete]);

  return <DataTable data={rules} columns={columns} columnFiltering globalFilter={false} />;
}
