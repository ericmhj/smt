'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

interface PuntoFueraCumplimiento {
  puntoId: number;
  area: string;
  zona: string;
  tipoPunto: 'nocturno' | 'natural';
  criterioFallido: 'iluminancia' | 'kf' | 'ambos';
  valorMedido: number;
  valorLimite: number;
  incertidumbre: number;
}

interface ComplianceSummary {
  totalPuntos: number;
  puntosEnCumplimiento: number;
  puntosFueraCumplimiento: PuntoFueraCumplimiento[];
}

interface ComplementaryStudyResponse {
  id: string;
  ticketIdentificador: string;
  metadata: {
    anotacion: string;
    puntosFallidos: PuntoFueraCumplimiento[];
  };
}

interface ComplianceSummaryModalProps {
  reactivoId: string;
  onClose: () => void;
  onStudyCreated: () => void;
}

export default function ComplianceSummaryModal({
  reactivoId,
  onClose,
  onStudyCreated,
}: ComplianceSummaryModalProps) {
  const [summary, setSummary] = useState<ComplianceSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedPoints, setSelectedPoints] = useState<Set<number>>(new Set());

  const fetchSummary = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api<ComplianceSummary>(
        `/api/reactivos/${reactivoId}/compliance-summary`,
      );
      setSummary(data);
      // Select all failed points by default
      setSelectedPoints(new Set(data.puntosFueraCumplimiento.map((p) => p.puntoId)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al obtener resumen de cumplimiento');
    } finally {
      setLoading(false);
    }
  };

  // Fetch on mount
  useState(() => {
    fetchSummary();
  });

  const togglePoint = (puntoId: number) => {
    setSelectedPoints((prev) => {
      const next = new Set(prev);
      if (next.has(puntoId)) next.delete(puntoId);
      else next.add(puntoId);
      return next;
    });
  };

  const handleCreateStudy = async () => {
    if (!summary) return;
    const puntosFallidos = summary.puntosFueraCumplimiento.filter((p) =>
      selectedPoints.has(p.puntoId),
    );
    if (puntosFallidos.length === 0) {
      setError('Seleccione al menos un punto fuera de cumplimiento');
      return;
    }

    setCreating(true);
    setError('');
    try {
      const result = await api<ComplementaryStudyResponse>(
        `/api/reactivos/${reactivoId}/complementario-cumplimiento`,
        {
          method: 'POST',
          body: JSON.stringify({ puntosFallidos }),
        },
      );
      setSuccess(
        `Estudio complementario creado exitosamente (${result.ticketIdentificador}). Se programó a 10 días hábiles.`,
      );
      onStudyCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear estudio complementario');
    } finally {
      setCreating(false);
    }
  };

  const criterioLabel = (c: string) => {
    switch (c) {
      case 'iluminancia': return 'Iluminancia';
      case 'kf': return 'Factor Kf';
      case 'ambos': return 'Ilum. + Kf';
      default: return c;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-[600px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h3 className="text-base font-semibold text-gray-800">
              Resumen de Cumplimiento
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Evalúe los puntos fuera de cumplimiento y genere un estudio complementario
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-5">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="w-8 h-8 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
              <span className="ml-3 text-sm text-gray-500">Analizando cumplimiento...</span>
            </div>
          )}

          {error && (
            <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg mb-4">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-green-50 text-green-700 text-sm p-4 rounded-lg">
              <p className="font-medium">✓ {success}</p>
              <button
                onClick={onClose}
                className="mt-3 px-4 py-1.5 bg-green-600 text-white text-xs rounded-md hover:bg-green-700"
              >
                Cerrar
              </button>
            </div>
          )}

          {summary && !success && (
            <>
              {/* Summary stats */}
              <div className="grid grid-cols-3 gap-3 mb-5">
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-gray-800">{summary.totalPuntos}</p>
                  <p className="text-xs text-gray-500">Total puntos</p>
                </div>
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-green-600">
                    {summary.puntosEnCumplimiento}
                  </p>
                  <p className="text-xs text-green-600">Cumplen</p>
                </div>
                <div className="bg-red-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-red-600">
                    {summary.puntosFueraCumplimiento.length}
                  </p>
                  <p className="text-xs text-red-600">No cumplen</p>
                </div>
              </div>

              {/* Failed points table */}
              {summary.puntosFueraCumplimiento.length > 0 ? (
                <>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">
                    Puntos fuera de cumplimiento
                  </h4>
                  <div className="border rounded-lg overflow-hidden mb-4">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left">
                            <input
                              type="checkbox"
                              checked={selectedPoints.size === summary.puntosFueraCumplimiento.length}
                              onChange={() => {
                                if (selectedPoints.size === summary.puntosFueraCumplimiento.length) {
                                  setSelectedPoints(new Set());
                                } else {
                                  setSelectedPoints(
                                    new Set(summary.puntosFueraCumplimiento.map((p) => p.puntoId)),
                                  );
                                }
                              }}
                              className="rounded"
                            />
                          </th>
                          <th className="px-3 py-2 text-left text-gray-600">Pto.</th>
                          <th className="px-3 py-2 text-left text-gray-600">Área / Zona</th>
                          <th className="px-3 py-2 text-left text-gray-600">Tipo</th>
                          <th className="px-3 py-2 text-left text-gray-600">Criterio</th>
                          <th className="px-3 py-2 text-right text-gray-600">Medido</th>
                          <th className="px-3 py-2 text-right text-gray-600">Límite</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.puntosFueraCumplimiento.map((punto) => (
                          <tr
                            key={punto.puntoId}
                            className={`border-t ${selectedPoints.has(punto.puntoId) ? 'bg-blue-50' : ''}`}
                          >
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                checked={selectedPoints.has(punto.puntoId)}
                                onChange={() => togglePoint(punto.puntoId)}
                                className="rounded"
                              />
                            </td>
                            <td className="px-3 py-2 font-medium">{punto.puntoId}</td>
                            <td className="px-3 py-2">
                              {punto.area}
                              {punto.zona && <span className="text-gray-400"> / {punto.zona}</span>}
                            </td>
                            <td className="px-3 py-2">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${punto.tipoPunto === 'nocturno' ? 'bg-indigo-100 text-indigo-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                {punto.tipoPunto === 'nocturno' ? 'Noct.' : 'Natural'}
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              <span className="text-red-600 font-medium">
                                {criterioLabel(punto.criterioFallido)}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right font-mono">
                              {punto.valorMedido.toFixed(1)}
                            </td>
                            <td className="px-3 py-2 text-right font-mono">
                              {punto.valorLimite.toFixed(1)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                    <p className="text-xs text-blue-800">
                      <strong>Estudio Complementario:</strong> Se creará una nueva tarjeta con estado
                      &quot;Programada&quot; y fecha de ejecución a 10 días hábiles. Incluirá solo los
                      puntos seleccionados con sus matrices y estructura original, y una anotación
                      referenciando el estudio de origen.
                    </p>
                  </div>
                </>
              ) : (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                  <p className="text-green-700 font-medium">
                    ✓ Todos los puntos están en cumplimiento
                  </p>
                  <p className="text-xs text-green-600 mt-1">
                    No se requiere estudio complementario
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {summary && !success && summary.puntosFueraCumplimiento.length > 0 && (
          <div className="flex items-center justify-between px-5 py-4 border-t bg-gray-50 rounded-b-xl">
            <span className="text-xs text-gray-500">
              {selectedPoints.size} punto(s) seleccionado(s)
            </span>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-600 bg-white border rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateStudy}
                disabled={creating || selectedPoints.size === 0}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creating ? 'Creando...' : '🔄 Crear Estudio Complementario'}
              </button>
            </div>
          </div>
        )}

        {/* Footer for all-compliant or success */}
        {summary && (summary.puntosFueraCumplimiento.length === 0 || success) && (
          <div className="flex items-center justify-end px-5 py-4 border-t bg-gray-50 rounded-b-xl">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 bg-white border rounded-lg hover:bg-gray-50"
            >
              Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
