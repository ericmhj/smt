'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

interface Cliente {
  id: string;
  nombre: string;
  empresa: string | null;
  email: string;
  telefono: string | null;
  industria: string | null;
  etiquetas: string[];
  activo: boolean;
}

interface ClientesResponse {
  data: Cliente[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export default function ClientesPage() {
  const router = useRouter();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [industria, setIndustria] = useState('');
  const [etiquetas, setEtiquetas] = useState('');
  const [activo, setActivo] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  const fetchClientes = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      if (industria) params.set('industria', industria);
      if (etiquetas) params.set('etiquetas', etiquetas);
      if (activo) params.set('activo', activo);

      let response: ClientesResponse;
      if (search.trim()) {
        params.set('q', search.trim());
        response = await api<ClientesResponse>(`/api/clientes/search?${params.toString()}`);
      } else {
        response = await api<ClientesResponse>(`/api/clientes?${params.toString()}`);
      }
      setClientes(response.data || []);
      setTotal(response.total || 0);
    } catch {
      setClientes([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [search, industria, etiquetas, activo, page]);

  useEffect(() => {
    fetchClientes();
  }, [fetchClientes]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Clientes</h1>
        <Link
          href="/clientes/nuevo"
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Nuevo cliente
        </Link>
      </div>

      <div className="flex flex-wrap gap-4 mb-4">
        <input
          type="text"
          placeholder="Buscar clientes..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm w-64"
        />
        <select
          value={industria}
          onChange={(e) => { setIndustria(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        >
          <option value="">Todas las industrias</option>
          <option value="alimentos">Alimentos</option>
          <option value="farmaceutica">Farmacéutica</option>
          <option value="cosmeticos">Cosméticos</option>
          <option value="agricultura">Agricultura</option>
          <option value="ambiental">Ambiental</option>
          <option value="industrial">Industrial</option>
          <option value="otro">Otro</option>
        </select>
        <input
          type="text"
          placeholder="Filtrar etiquetas (separar con coma)"
          value={etiquetas}
          onChange={(e) => { setEtiquetas(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm w-48"
        />
        <select
          value={activo}
          onChange={(e) => { setActivo(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        >
          <option value="">Todos</option>
          <option value="true">Activos</option>
          <option value="false">Inactivos</option>
        </select>
      </div>

      {loading ? (
        <p className="text-gray-500">Cargando...</p>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nombre</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Empresa</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Teléfono</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Industria</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Etiquetas</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Activo</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {clientes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    No se encontraron clientes
                  </td>
                </tr>
              ) : (
                clientes.map((cliente) => (
                  <tr
                    key={cliente.id}
                    onClick={() => router.push(`/clientes/${cliente.id}`)}
                    className="hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="px-4 py-3 text-sm text-gray-900">{cliente.nombre}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{cliente.empresa || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{cliente.email}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{cliente.telefono || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 capitalize">{cliente.industria || '—'}</td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex flex-wrap gap-1">
                        {(cliente.etiquetas || []).map((tag) => (
                          <span key={tag} className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${cliente.activo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {cliente.activo ? 'Sí' : 'No'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-600">
            Mostrando {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} de {total}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 text-sm border rounded-md disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1 text-sm border rounded-md disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
