'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

interface FormErrors {
  nombre?: string;
  rfc?: string;
  email?: string;
  telefono?: string;
  direccion?: string;
  actividadPrincipal?: string;
  contacto?: string;
  horarios?: string;
}

export default function NuevoClientePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
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

  const validate = (): boolean => {
    const errs: FormErrors = {};
    if (!form.nombre.trim()) errs.nombre = 'El nombre o razón social es obligatorio';
    if (!form.rfc.trim()) errs.rfc = 'El RFC es obligatorio';
    else if (form.rfc.trim().length < 10) errs.rfc = 'RFC debe tener al menos 10 caracteres';
    if (!form.email.trim()) {
      errs.email = 'El email es obligatorio';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errs.email = 'Email inválido';
    }
    if (!form.telefono.trim()) errs.telefono = 'El teléfono es obligatorio';
    if (!form.direccionCentroTrabajo.trim()) errs.direccion = 'El domicilio es obligatorio';
    if (!form.actividadPrincipal.trim()) errs.actividadPrincipal = 'La actividad principal es obligatoria';
    if (!form.contacto.trim()) errs.contacto = 'El contacto es obligatorio';
    if (!form.horarios.trim()) errs.horarios = 'Los horarios son obligatorios';
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
        email: form.email,
        telefono: form.telefono,
        direccionCentroTrabajo: form.direccionCentroTrabajo,
        actividadPrincipal: form.actividadPrincipal,
        contacto: form.contacto,
        horarios: form.horarios,
      };
      if (form.empresa) body.empresa = form.empresa;
      if (form.industria) body.industria = form.industria;

      await api('/api/clientes', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      router.push('/clientes');
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Error al crear cliente');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Nuevo Cliente</h1>

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
          <input type="text" value={form.rfc} onChange={(e) => setForm({ ...form, rfc: e.target.value.toUpperCase() })} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" maxLength={13} placeholder="Ej: ABC850101XYZ" />
          {errors.rfc && <p className="text-red-600 text-xs mt-1">{errors.rfc}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Empresa (nombre comercial)</label>
          <input type="text" value={form.empresa} onChange={(e) => setForm({ ...form, empresa: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Domicilio del Centro de Trabajo *</label>
          <input type="text" value={form.direccionCentroTrabajo} onChange={(e) => setForm({ ...form, direccionCentroTrabajo: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" placeholder="Calle, No., Col., Ciudad, Estado, C.P." />
          {errors.direccion && <p className="text-red-600 text-xs mt-1">{errors.direccion}</p>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
            {errors.email && <p className="text-red-600 text-xs mt-1">{errors.email}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono *</label>
            <input type="text" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" placeholder="+52 XX XXXX XXXX" />
            {errors.telefono && <p className="text-red-600 text-xs mt-1">{errors.telefono}</p>}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Actividad Principal *</label>
          <input type="text" value={form.actividadPrincipal} onChange={(e) => setForm({ ...form, actividadPrincipal: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" placeholder="Ej: Manufactura de piezas metálicas" />
          {errors.actividadPrincipal && <p className="text-red-600 text-xs mt-1">{errors.actividadPrincipal}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Usuario / Contacto *</label>
          <input type="text" value={form.contacto} onChange={(e) => setForm({ ...form, contacto: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" placeholder="Nombre — Cargo" />
          {errors.contacto && <p className="text-red-600 text-xs mt-1">{errors.contacto}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Horarios de Trabajo *</label>
          <input type="text" value={form.horarios} onChange={(e) => setForm({ ...form, horarios: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" placeholder="Ej: Lunes a Viernes 8:00 - 18:00" />
          {errors.horarios && <p className="text-red-600 text-xs mt-1">{errors.horarios}</p>}
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
            {loading ? 'Guardando...' : 'Crear Cliente'}
          </button>
          <button type="button" onClick={() => router.push('/clientes')} className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
