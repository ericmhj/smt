'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { api } from '@/lib/api';

interface FormErrors {
  nombre?: string;
  rfc?: string;
  email?: string;
  telefono?: string;
  direccionCentroTrabajo?: string;
  actividadPrincipal?: string;
  contacto?: string;
  horarios?: string;
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
    rfc: '',
    email: '',
    telefono: '',
    direccionCentroTrabajo: '',
    actividadPrincipal: '',
    contacto: '',
    horarios: '',
    industria: '',
  });

  useEffect(() => {
    const fetchCliente = async () => {
      try {
        const data = await api<Record<string, unknown>>(`/api/clientes/${clienteId}`);
        setForm({
          nombre: (data.nombre as string) || '',
          empresa: (data.empresa as string) || '',
          rfc: (data.rfc as string) || '',
          email: (data.email as string) || '',
          telefono: (data.telefono as string) || '',
          direccionCentroTrabajo: (data.direccionCentroTrabajo as string) || '',
          actividadPrincipal: (data.actividadPrincipal as string) || '',
          contacto: (data.contacto as string) || '',
          horarios: (data.horarios as string) || '',
          industria: (data.industria as string) || '',
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
    if (!form.rfc.trim()) errs.rfc = 'El RFC es obligatorio';
    if (!form.telefono.trim()) errs.telefono = 'El teléfono es obligatorio';
    if (!form.direccionCentroTrabajo.trim()) errs.direccionCentroTrabajo = 'El domicilio es obligatorio';
    if (!form.actividadPrincipal.trim()) errs.actividadPrincipal = 'La actividad principal es obligatoria';
    if (!form.contacto.trim()) errs.contacto = 'El contacto es obligatorio';
    if (!form.horarios.trim()) errs.horarios = 'Los horarios son obligatorios';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Email inválido';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError('');
    if (!validate()) return;

    setLoading(true);
    try {
      const body: Record<string, string> = {
        nombre: form.nombre,
        rfc: form.rfc,
        telefono: form.telefono,
        direccionCentroTrabajo: form.direccionCentroTrabajo,
        actividadPrincipal: form.actividadPrincipal,
        contacto: form.contacto,
        horarios: form.horarios,
      };
      if (form.empresa) body.empresa = form.empresa;
      if (form.email) body.email = form.email;
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
          <label className="block text-sm font-medium text-gray-700 mb-1">Nombre o Razón Social *</label>
          <input type="text" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
          {errors.nombre && <p className="text-red-600 text-xs mt-1">{errors.nombre}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">R.F.C. *</label>
          <input type="text" value={form.rfc} onChange={(e) => setForm({ ...form, rfc: e.target.value.toUpperCase() })} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" maxLength={13} />
          {errors.rfc && <p className="text-red-600 text-xs mt-1">{errors.rfc}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Domicilio del Centro de Trabajo *</label>
          <input type="text" value={form.direccionCentroTrabajo} onChange={(e) => setForm({ ...form, direccionCentroTrabajo: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
          {errors.direccionCentroTrabajo && <p className="text-red-600 text-xs mt-1">{errors.direccionCentroTrabajo}</p>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono *</label>
            <input type="text" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
            {errors.telefono && <p className="text-red-600 text-xs mt-1">{errors.telefono}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
            {errors.email && <p className="text-red-600 text-xs mt-1">{errors.email}</p>}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Actividad Principal *</label>
          <input type="text" value={form.actividadPrincipal} onChange={(e) => setForm({ ...form, actividadPrincipal: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
          {errors.actividadPrincipal && <p className="text-red-600 text-xs mt-1">{errors.actividadPrincipal}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Usuario / Contacto *</label>
          <input type="text" value={form.contacto} onChange={(e) => setForm({ ...form, contacto: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
          {errors.contacto && <p className="text-red-600 text-xs mt-1">{errors.contacto}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Horarios de Trabajo *</label>
          <input type="text" value={form.horarios} onChange={(e) => setForm({ ...form, horarios: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
          {errors.horarios && <p className="text-red-600 text-xs mt-1">{errors.horarios}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Empresa (nombre comercial)</label>
          <input type="text" value={form.empresa} onChange={(e) => setForm({ ...form, empresa: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Industria</label>
          <select value={form.industria} onChange={(e) => setForm({ ...form, industria: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
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
          <button type="submit" disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
            {loading ? 'Guardando...' : 'Guardar Cambios'}
          </button>
          <button type="button" onClick={() => router.push(`/clientes/${clienteId}`)} className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
