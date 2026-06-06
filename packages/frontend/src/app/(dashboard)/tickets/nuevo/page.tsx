'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

interface ClienteOption {
  id: string;
  nombre: string;
  empresa: string | null;
}

interface FormOption {
  id: string;
  name: string;
}

interface TecnicoOption {
  id: string;
  name: string;
  email: string;
}

interface SlaConfig {
  alta: number;
  media: number;
  baja: number;
}

export default function NuevoTicketPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState('');

  const [clientes, setClientes] = useState<ClienteOption[]>([]);
  const [forms, setForms] = useState<FormOption[]>([]);
  const [tecnicos, setTecnicos] = useState<TecnicoOption[]>([]);
  const [slaConfig, setSlaConfig] = useState<SlaConfig>({ alta: 24, media: 48, baja: 72 });

  const [clienteSearch, setClienteSearch] = useState('');
  const [form, setForm] = useState({
    clienteId: '',
    formId: '',
    tecnicoAsignadoId: '',
    prioridad: 'media' as 'alta' | 'media' | 'baja',
  });

  useEffect(() => {
    const fetchData = async () => {
      const [clientesRes, formsRes, tecnicosRes, slaRes] = await Promise.allSettled([
        api<{ data: ClienteOption[] }>('/api/clientes?pageSize=100'),
        api<{ data: FormOption[] }>('/api/forms?pageSize=100'),
        api<{ data: TecnicoOption[] }>('/api/users/tecnicos'),
        api<{ prioridad: string; horasLimite: number }[]>('/api/config/sla'),
      ]);
      if (clientesRes.status === 'fulfilled') setClientes(clientesRes.value.data || []);
      if (formsRes.status === 'fulfilled') setForms(formsRes.value.data || []);
      if (tecnicosRes.status === 'fulfilled') setTecnicos(tecnicosRes.value.data || []);
      if (slaRes.status === 'fulfilled' && Array.isArray(slaRes.value)) {
        const config: SlaConfig = { alta: 24, media: 48, baja: 72 };
        for (const entry of slaRes.value) {
          if (entry.prioridad === 'alta') config.alta = entry.horasLimite;
          if (entry.prioridad === 'media') config.media = entry.horasLimite;
          if (entry.prioridad === 'baja') config.baja = entry.horasLimite;
        }
        setSlaConfig(config);
      }
    };
    fetchData();
  }, []);

  const filteredClientes = clientes.filter((c) =>
    c.nombre.toLowerCase().includes(clienteSearch.toLowerCase()) ||
    (c.empresa && c.empresa.toLowerCase().includes(clienteSearch.toLowerCase()))
  );

  const slaHours = slaConfig[form.prioridad] || 48;
  const estimatedDeadline = new Date(Date.now() + slaHours * 60 * 60 * 1000);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError('');

    if (!form.clienteId || !form.formId) {
      setServerError('Debe seleccionar un cliente y un formulario');
      return;
    }

    setLoading(true);
    try {
      const body: Record<string, string> = {
        clienteId: form.clienteId,
        formId: form.formId,
        prioridad: form.prioridad,
      };
      if (form.tecnicoAsignadoId) body.tecnicoAsignadoId = form.tecnicoAsignadoId;

      await api('/api/tickets', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      router.push('/tickets');
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Error al crear ticket');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Nuevo Ticket</h1>

      {serverError && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md text-sm">{serverError}</div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-4">
        {/* Client Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Cliente *</label>
          <input
            type="text"
            placeholder="Buscar cliente..."
            value={clienteSearch}
            onChange={(e) => setClienteSearch(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm mb-2"
          />
          <select
            value={form.clienteId}
            onChange={(e) => setForm({ ...form, clienteId: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            size={Math.min(5, filteredClientes.length || 1)}
          >
            <option value="">Seleccionar cliente...</option>
            {filteredClientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre} {c.empresa ? `(${c.empresa})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Form Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Formulario / Norma *</label>
          <select
            value={form.formId}
            onChange={(e) => setForm({ ...form, formId: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          >
            <option value="">Seleccionar formulario...</option>
            {forms.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>

        {/* Técnico Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Técnico asignado</label>
          <select
            value={form.tecnicoAsignadoId}
            onChange={(e) => setForm({ ...form, tecnicoAsignadoId: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          >
            <option value="">Asignación automática</option>
            {tecnicos.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">Si no selecciona un técnico, se asignará automáticamente según las reglas configuradas.</p>
        </div>

        {/* Priority */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Prioridad *</label>
          <select
            value={form.prioridad}
            onChange={(e) => setForm({ ...form, prioridad: e.target.value as 'alta' | 'media' | 'baja' })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          >
            <option value="alta">Alta</option>
            <option value="media">Media</option>
            <option value="baja">Baja</option>
          </select>
        </div>

        {/* SLA Info */}
        <div className="p-4 bg-blue-50 rounded-md">
          <p className="text-sm font-medium text-blue-800">SLA Estimado</p>
          <p className="text-sm text-blue-700">
            Horas límite: {slaHours}h — Fecha límite estimada:{' '}
            {estimatedDeadline.toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' })}
          </p>
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Creando...' : 'Crear Ticket'}
          </button>
          <button
            type="button"
            onClick={() => router.push('/tickets')}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
