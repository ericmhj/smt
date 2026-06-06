'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { api } from '@/lib/api';

interface FormErrors {
  nombre?: string;
  email?: string;
  telefono?: string;
}

export default function EditarClientePage() {
  const router = useRouter();
  const params = useParams();
  const clienteId = params.id as string;

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [errors, setErrors] = useState<FormErrors>({});
  const [serverError, setServerError] = useState('');

  const [form, setForm] = useState({
    nombre: '',
    empresa: '',
    email: '',
    telefono: '',
    direccion: '',
    industria: '',
  });

  useEffect(() => {
    const fetchCliente = async () => {
      try {
        const data = await api<{
          id: string;
          nombre: string;
          empresa: string | null;
          email: string;
          telefono: string | null;
          direccion: string | null;
          industria: string | null;
        }>(`/api/clientes/${clienteId}`);
        setForm({
          nombre: data.nombre || '',
          empresa: data.empresa || '',
          email: data.email || '',
          telefono: data.telefono || '',
          direccion: data.direccion || '',
          industria: data.industria || '',
        });
      } catch {
        setServerError('Error al cargar el cliente');
      } finally {
        setFetching(false);
      }
    };
    fetchCliente();
  }, [clienteId]);

  const validate = (): boolean => {
    const errs: FormErrors = {};
    if (!form.nombre.trim()) errs.nombre = 'El nombre es obligatorio';
    if (!form.email.trim()) {
      errs.email = 'El email es obligatorio';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errs.email = 'Email inválido';
    }
    if (form.telefono && !/^[\d\s\-+().]{7,20}$/.test(form.telefono)) {
      errs.telefono = 'Formato de teléfono inválido';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError('');
    if (!validate()) return;

    setLoading(true);
    try {
      const body: Record<string, string> = { nombre: form.nombre, email: form.email };
      if (form.empresa) body.empresa = form.empresa;
      if (form.telefono) body.telefono = form.telefono;
      if (form.direccion) body.direccion = form.direccion;
      if (form.industria) body.industria = form.industria;

      await api(`/api/clientes/${clienteId}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      router.push(`/clientes/${clienteId}`);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Error al actualizar cliente');
    } finally {
      setLoading(false);
    }
  };

  if (fetching) return <p className="text-gray-500">Cargando...</p>;

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Editar Cliente</h1>

      {serverError && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md text-sm">{serverError}</div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
          <input
            type="text"
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
          {errors.nombre && <p className="text-red-600 text-xs mt-1">{errors.nombre}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Empresa</label>
          <input
            type="text"
            value={form.empresa}
            onChange={(e) => setForm({ ...form, empresa: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
          {errors.email && <p className="text-red-600 text-xs mt-1">{errors.email}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
          <input
            type="text"
            value={form.telefono}
            onChange={(e) => setForm({ ...form, telefono: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
          {errors.telefono && <p className="text-red-600 text-xs mt-1">{errors.telefono}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
          <input
            type="text"
            value={form.direccion}
            onChange={(e) => setForm({ ...form, direccion: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Industria</label>
          <select
            value={form.industria}
            onChange={(e) => setForm({ ...form, industria: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          >
            <option value="">Seleccionar...</option>
            <option value="alimentos">Alimentos</option>
            <option value="farmaceutica">Farmacéutica</option>
            <option value="cosmeticos">Cosméticos</option>
            <option value="agricultura">Agricultura</option>
            <option value="ambiental">Ambiental</option>
            <option value="industrial">Industrial</option>
            <option value="otro">Otro</option>
          </select>
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Guardando...' : 'Guardar Cambios'}
          </button>
          <button
            type="button"
            onClick={() => router.push(`/clientes/${clienteId}`)}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
