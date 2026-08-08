'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

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

  // Load form types from templates (Formularios Padre)
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

  useEffect(() => {
    fetchRules();
  }, [filterFormType]);

  const handleToggle = async (id: string) => {
    try {
      await api(`/api/validation-rules/${id}/toggle`, { method: 'PATCH' });
      await fetchRules();
    } catch (error) {
      console.error('Error toggling rule:', error);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`¿Eliminar la regla "${name}"? Esta acción no se puede deshacer.`)) return;
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

      {/* Filter */}
      <div className="flex gap-4">
        <select
          value={filterFormType}
          onChange={(e) => setFilterFormType(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
          aria-label="Filtrar por tipo de formulario"
        >
          <option value="">Todos los tipos</option>
          {formTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nombre</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Secciones</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">Cargando...</td>
              </tr>
            ) : rules.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">No hay reglas registradas.</td>
              </tr>
            ) : (
              rules.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-800">
                      {r.formType}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-gray-900">{r.name}</div>
                    {r.description && <div className="text-xs text-gray-500">{r.description}</div>}
                  </td>
                  <td className="px-4 py-3">
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
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggle(r.id)}
                      className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full cursor-pointer transition-colors ${
                        r.isActive
                          ? 'bg-green-100 text-green-800 hover:bg-green-200'
                          : 'bg-red-100 text-red-800 hover:bg-red-200'
                      }`}
                    >
                      {r.isActive ? 'Activa' : 'Inactiva'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-sm space-x-2">
                    <Link
                      href={`/platform/validation-rules/editar/${r.id}`}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      Editar
                    </Link>
                    <button
                      onClick={() => handleDelete(r.id, r.name)}
                      className="text-red-600 hover:text-red-800"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
