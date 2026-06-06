'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

interface TecnicoOption {
  id: string;
  name: string;
  email: string;
}

interface ReglaAsignacion {
  id: string;
  nombre: string;
  tipo: 'ubicacion' | 'carga';
  activo: boolean;
  condiciones: {
    patrones?: { patron: string; tecnicoId: string }[];
    pool?: string[];
  };
}

export default function ConfiguracionAsignacionPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [reglas, setReglas] = useState<ReglaAsignacion[]>([]);
  const [tecnicos, setTecnicos] = useState<TecnicoOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    nombre: '',
    tipo: 'ubicacion' as 'ubicacion' | 'carga',
    patrones: [{ patron: '', tecnicoId: '' }],
    pool: [] as string[],
  });

  useEffect(() => {
    if (user && user.role !== 'manager') {
      router.push('/');
      return;
    }
    fetchData();
  }, [user, router]);

  const fetchData = async () => {
    try {
      const [reglasRes, tecnicosRes] = await Promise.all([
        api<{ data: ReglaAsignacion[] } | ReglaAsignacion[]>('/api/config/reglas-asignacion'),
        api<{ data: TecnicoOption[] }>('/api/users/tecnicos'),
      ]);
      setReglas(Array.isArray(reglasRes) ? reglasRes : reglasRes.data || []);
      setTecnicos(tecnicosRes.data || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  const createRegla = async () => {
    if (!formData.nombre.trim()) return;
    try {
      const body: Record<string, unknown> = {
        nombre: formData.nombre,
        tipo: formData.tipo,
      };
      if (formData.tipo === 'ubicacion') {
        body.condiciones = { patrones: formData.patrones.filter((p) => p.patron && p.tecnicoId) };
      } else {
        body.condiciones = { pool: formData.pool };
      }

      await api('/api/config/reglas-asignacion', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setShowForm(false);
      setFormData({ nombre: '', tipo: 'ubicacion', patrones: [{ patron: '', tecnicoId: '' }], pool: [] });
      fetchData();
    } catch { /* ignore */ }
  };

  const toggleRegla = async (id: string, activo: boolean) => {
    try {
      await api(`/api/config/reglas-asignacion/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ activo: !activo }),
      });
      fetchData();
    } catch { /* ignore */ }
  };

  const deleteRegla = async (id: string) => {
    if (!confirm('¿Eliminar esta regla?')) return;
    try {
      await api(`/api/config/reglas-asignacion/${id}`, { method: 'DELETE' });
      fetchData();
    } catch { /* ignore */ }
  };

  const addPatron = () => {
    setFormData({ ...formData, patrones: [...formData.patrones, { patron: '', tecnicoId: '' }] });
  };

  const updatePatron = (index: number, field: 'patron' | 'tecnicoId', value: string) => {
    const patrones = [...formData.patrones];
    patrones[index] = { ...patrones[index], [field]: value };
    setFormData({ ...formData, patrones });
  };

  const togglePoolTecnico = (tecnicoId: string) => {
    setFormData((prev) => ({
      ...prev,
      pool: prev.pool.includes(tecnicoId)
        ? prev.pool.filter((id) => id !== tecnicoId)
        : [...prev.pool, tecnicoId],
    }));
  };

  if (loading) return <p className="text-gray-500">Cargando...</p>;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Reglas de Asignación</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
        >
          Nueva regla
        </button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="bg-white rounded-lg shadow p-6 mb-6 space-y-4">
          <h3 className="text-lg font-semibold text-gray-800">Crear Regla</h3>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
            <input
              type="text"
              value={formData.nombre}
              onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
            <select
              value={formData.tipo}
              onChange={(e) => setFormData({ ...formData, tipo: e.target.value as 'ubicacion' | 'carga' })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="ubicacion">Por ubicación</option>
              <option value="carga">Por carga de trabajo</option>
            </select>
          </div>

          {formData.tipo === 'ubicacion' && (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">Patrones + Técnico</label>
              {formData.patrones.map((p, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Patrón (ej: zona-norte)"
                    value={p.patron}
                    onChange={(e) => updatePatron(i, 'patron', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
                  />
                  <select
                    value={p.tecnicoId}
                    onChange={(e) => updatePatron(i, 'tecnicoId', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
                  >
                    <option value="">Seleccionar técnico...</option>
                    {tecnicos.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              ))}
              <button
                type="button"
                onClick={addPatron}
                className="text-blue-600 hover:text-blue-800 text-sm"
              >
                + Agregar patrón
              </button>
            </div>
          )}

          {formData.tipo === 'carga' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Pool de técnicos</label>
              <div className="space-y-2">
                {tecnicos.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={formData.pool.includes(t.id)}
                      onChange={() => togglePoolTecnico(t.id)}
                      className="rounded border-gray-300"
                    />
                    {t.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={createRegla}
              className="px-4 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700"
            >
              Crear
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm text-gray-700"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Rules List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {reglas.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">No hay reglas configuradas</p>
        ) : (
          <div className="divide-y divide-gray-200">
            {reglas.map((regla) => (
              <div key={regla.id} className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-800">{regla.nombre}</p>
                  <p className="text-sm text-gray-500 capitalize">Tipo: {regla.tipo}</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => toggleRegla(regla.id, regla.activo)}
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                      regla.activo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {regla.activo ? 'Activa' : 'Inactiva'}
                  </button>
                  <button
                    onClick={() => deleteRegla(regla.id)}
                    className="text-red-600 hover:text-red-800 text-sm"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
