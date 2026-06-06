'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

interface SlaEntry {
  prioridad: string;
  horasLimite: number;
}

export default function ConfiguracionSlaPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [slaEntries, setSlaEntries] = useState<SlaEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user && user.role !== 'manager') {
      router.push('/');
      return;
    }
    const fetchSla = async () => {
      try {
        const data = await api<SlaEntry[] | Record<string, number>>('/api/config/sla');
        if (Array.isArray(data)) {
          setSlaEntries(data);
        } else {
          // If response is { alta: 24, media: 48, baja: 72 }
          setSlaEntries(
            Object.entries(data).map(([prioridad, horasLimite]) => ({ prioridad, horasLimite }))
          );
        }
      } catch {
        setSlaEntries([
          { prioridad: 'alta', horasLimite: 24 },
          { prioridad: 'media', horasLimite: 48 },
          { prioridad: 'baja', horasLimite: 72 },
        ]);
      } finally {
        setLoading(false);
      }
    };
    fetchSla();
  }, [user, router]);

  const startEdit = (prioridad: string, currentValue: number) => {
    setEditing(prioridad);
    setEditValue(String(currentValue));
  };

  const saveEdit = async (prioridad: string) => {
    const hours = parseInt(editValue, 10);
    if (isNaN(hours) || hours <= 0) return;

    setSaving(true);
    try {
      await api(`/api/config/sla/${prioridad}`, {
        method: 'PUT',
        body: JSON.stringify({ horasLimite: hours }),
      });
      setSlaEntries((prev) =>
        prev.map((e) => (e.prioridad === prioridad ? { ...e, horasLimite: hours } : e))
      );
      setEditing(null);
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  if (loading) return <p className="text-gray-500">Cargando...</p>;

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Configuración SLA</h1>
      <p className="text-sm text-gray-600 mb-4">
        Define las horas límite para cada nivel de prioridad de tickets.
      </p>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Prioridad</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Horas Límite</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {slaEntries.map((entry) => (
              <tr key={entry.prioridad}>
                <td className="px-6 py-4 text-sm font-medium text-gray-900 capitalize">{entry.prioridad}</td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  {editing === entry.prioridad ? (
                    <input
                      type="number"
                      min="1"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && saveEdit(entry.prioridad)}
                      className="w-24 px-2 py-1 border border-gray-300 rounded text-sm"
                      autoFocus
                    />
                  ) : (
                    <span>{entry.horasLimite}h</span>
                  )}
                </td>
                <td className="px-6 py-4 text-sm">
                  {editing === entry.prioridad ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveEdit(entry.prioridad)}
                        disabled={saving}
                        className="text-green-600 hover:text-green-800 text-sm"
                      >
                        Guardar
                      </button>
                      <button
                        onClick={() => setEditing(null)}
                        className="text-gray-600 hover:text-gray-800 text-sm"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => startEdit(entry.prioridad, entry.horasLimite)}
                      className="text-blue-600 hover:text-blue-800 text-sm"
                    >
                      Editar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
