'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

interface AssignmentFormProps {
  onSuccess: () => void;
}

interface SelectOption {
  id: string;
  name: string;
}

export default function AssignmentForm({ onSuccess }: AssignmentFormProps) {
  const [technicians, setTechnicians] = useState<SelectOption[]>([]);
  const [forms, setForms] = useState<SelectOption[]>([]);
  const [tecnicoId, setTecnicoId] = useState('');
  const [formId, setFormId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchOptions = async () => {
      const [usersRes, formsRes] = await Promise.allSettled([
        api<{ data: { id: string; name: string; role: string }[] }>('/api/users/tecnicos'),
        api<{ data: { id: string; name: string; isActive: boolean }[] }>('/api/forms'),
      ]);
      if (usersRes.status === 'fulfilled') {
        setTechnicians(
          (usersRes.value.data || []).map((u) => ({ id: u.id, name: u.name }))
        );
      }
      if (formsRes.status === 'fulfilled') {
        setForms(
          (formsRes.value.data || []).filter((f) => f.isActive).map((f) => ({ id: f.id, name: f.name }))
        );
      }
    };
    fetchOptions();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await api('/api/assignments', {
        method: 'POST',
        body: JSON.stringify({ tecnicoId, formId }),
      });
      setTecnicoId('');
      setFormId('');
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al asignar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md">{error}</div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Técnico</label>
        <select
          value={tecnicoId}
          onChange={(e) => setTecnicoId(e.target.value)}
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Seleccionar técnico...</option>
          {technicians.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Formulario</label>
        <select
          value={formId}
          onChange={(e) => setFormId(e.target.value)}
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Seleccionar formulario...</option>
          {forms.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm"
      >
        {loading ? 'Asignando...' : 'Asignar'}
      </button>
    </form>
  );
}
