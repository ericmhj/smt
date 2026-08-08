'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface CalculationRule {
  id: string;
  formType: string;
  name: string;
  description: string | null;
  isActive: boolean;
  calculations: Array<{
    sectionName: string;
    scope: string;
    rowPattern?: string;
    rules: Array<{ targetField: string; formula: string; label?: string }>;
  }>;
}

export default function CalculationRulesPage() {
  const [rules, setRules] = useState<CalculationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterFormType, setFilterFormType] = useState('');
  const [formTypes, setFormTypes] = useState<string[]>([]);

  const fetchRules = async () => {
    setLoading(true);
    try {
      const url = filterFormType
        ? `/api/calculation-rules?form_type=${filterFormType}`
        : '/api/calculation-rules';
      const data = await api<CalculationRule[]>(url);
      setRules(data);
    } catch (error) {
      console.error('Error fetching calculation rules:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load form types from templates (Formularios Padre)
  useEffect(() => {
    api<Array<{ formType: string }>>('/api/form-templates/all')
      .then((templates) => {
        const types = [...new Set(templates.map((t) => t.formType))];
        setFormTypes(types);
      })
      .catch(() => {});
  }, []);

  useEffect(() => { fetchRules(); }, [filterFormType]);

  const handleToggle = async (id: string) => {
    await api(`/api/calculation-rules/${id}/toggle`, { method: 'PATCH' });
    await fetchRules();
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`¿Eliminar la regla de cálculo "${name}"?`)) return;
    await api(`/api/calculation-rules/${id}`, { method: 'DELETE' });
    await fetchRules();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reglas de Cálculo</h1>
          <p className="text-sm text-gray-500 mt-1">Fórmulas automáticas aplicadas por tipo de formulario</p>
        </div>
        <Link
          href={filterFormType ? `/platform/calculation-rules/nuevo?form_type=${filterFormType}` : '/platform/calculation-rules/nuevo'}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
        >
          Nueva Regla
        </Link>
      </div>

      <div className="flex gap-4">
        <select
          value={filterFormType}
          onChange={(e) => setFilterFormType(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        >
          <option value="">Todos los tipos</option>
          {formTypes.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nombre</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cálculos</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">Cargando...</td></tr>
            ) : rules.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No hay reglas de cálculo.</td></tr>
            ) : (
              rules.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-indigo-100 text-indigo-800">{r.formType}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-gray-900">{r.name}</div>
                    {r.description && <div className="text-xs text-gray-500">{r.description}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {r.calculations.map((c, i) => (
                        <span key={i} className="inline-flex px-1.5 py-0.5 text-xs rounded bg-gray-100 text-gray-700">
                          {c.sectionName} ({c.scope}, {c.rules.length} fórmulas)
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggle(r.id)}
                      className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full cursor-pointer ${
                        r.isActive ? 'bg-green-100 text-green-800 hover:bg-green-200' : 'bg-red-100 text-red-800 hover:bg-red-200'
                      }`}
                    >
                      {r.isActive ? 'Activa' : 'Inactiva'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-sm space-x-2">
                    <Link href={`/platform/calculation-rules/editar/${r.id}`} className="text-blue-600 hover:text-blue-800">Editar</Link>
                    <button onClick={() => handleDelete(r.id, r.name)} className="text-red-600 hover:text-red-800">Eliminar</button>
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
