'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import DocumentUpload from '@/components/clientes/DocumentUpload';
import { stateLabels, stateColors } from '@/lib/states';

interface Contacto {
  id: string;
  nombre: string;
  email: string | null;
  telefono: string | null;
  cargo: string | null;
}

interface Documento {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  uploadedBy?: string;
}

interface Ticket {
  id: string;
  estado: string;
  prioridad: string;
  fechaLimite: string | null;
  formNombre?: string;
}

interface Cliente {
  id: string;
  nombre: string;
  empresa: string | null;
  rfc: string;
  email: string;
  telefono: string;
  direccionCentroTrabajo: string;
  actividadPrincipal: string;
  contacto: string;
  horarios: string;
  industria: string | null;
  etiquetas: string[];
  activo: boolean;
  contactos: Contacto[];
  documentos: Documento[];
  tickets: Ticket[];
}

export default function ClienteDetallePage() {
  const params = useParams();
  const router = useRouter();
  const clienteId = params.id as string;

  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [loading, setLoading] = useState(true);
  const [newTag, setNewTag] = useState('');
  const [showContactForm, setShowContactForm] = useState(false);
  const [contactForm, setContactForm] = useState({ nombre: '', email: '', telefono: '', cargo: '' });
  const [editingContact, setEditingContact] = useState<string | null>(null);

  const fetchCliente = useCallback(async () => {
    try {
      const data = await api<Cliente>(`/api/clientes/${clienteId}`);
      setCliente(data);
    } catch {
      setCliente(null);
    } finally {
      setLoading(false);
    }
  }, [clienteId]);

  useEffect(() => {
    fetchCliente();
  }, [fetchCliente]);

  const addTag = async () => {
    if (!newTag.trim() || !cliente) return;
    try {
      await api(`/api/clientes/${clienteId}/tags`, {
        method: 'POST',
        body: JSON.stringify({ tag: newTag.trim() }),
      });
      setNewTag('');
      fetchCliente();
    } catch { /* ignore */ }
  };

  const removeTag = async (tag: string) => {
    if (!cliente) return;
    try {
      await api(`/api/clientes/${clienteId}/tags/${encodeURIComponent(tag)}`, {
        method: 'DELETE',
      });
      fetchCliente();
    } catch { /* ignore */ }
  };

  const addContact = async () => {
    if (!contactForm.nombre.trim()) return;
    try {
      const body: Record<string, string> = { nombre: contactForm.nombre };
      if (contactForm.email) body.email = contactForm.email;
      if (contactForm.telefono) body.telefono = contactForm.telefono;
      if (contactForm.cargo) body.cargo = contactForm.cargo;

      await api(`/api/clientes/${clienteId}/contactos`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setContactForm({ nombre: '', email: '', telefono: '', cargo: '' });
      setShowContactForm(false);
      fetchCliente();
    } catch { /* ignore */ }
  };

  const updateContact = async (contactoId: string) => {
    try {
      const body: Record<string, string> = { nombre: contactForm.nombre };
      if (contactForm.email) body.email = contactForm.email;
      if (contactForm.telefono) body.telefono = contactForm.telefono;
      if (contactForm.cargo) body.cargo = contactForm.cargo;

      await api(`/api/clientes/${clienteId}/contactos/${contactoId}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      setEditingContact(null);
      setContactForm({ nombre: '', email: '', telefono: '', cargo: '' });
      fetchCliente();
    } catch { /* ignore */ }
  };

  const deleteContact = async (contactoId: string) => {
    if (!confirm('¿Eliminar este contacto?')) return;
    try {
      await api(`/api/clientes/${clienteId}/contactos/${contactoId}`, { method: 'DELETE' });
      fetchCliente();
    } catch { /* ignore */ }
  };

  if (loading) return <p className="text-gray-500">Cargando...</p>;
  if (!cliente) return <p className="text-red-600">Cliente no encontrado</p>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">{cliente.nombre}</h1>
        <div className="flex gap-2">
          <Link
            href={`/clientes/${clienteId}/editar`}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
          >
            Editar
          </Link>
          <button
            onClick={() => router.push('/clientes')}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 text-sm"
          >
            Volver
          </button>
        </div>
      </div>

      {/* Info Card */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Información del Centro de Trabajo</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div><span className="font-medium text-gray-600">Nombre o Razón Social:</span> {cliente.nombre}</div>
          <div><span className="font-medium text-gray-600">R.F.C.:</span> {cliente.rfc || '—'}</div>
          <div className="md:col-span-2"><span className="font-medium text-gray-600">Domicilio del Centro de Trabajo:</span> {cliente.direccionCentroTrabajo || '—'}</div>
          <div><span className="font-medium text-gray-600">Teléfono:</span> {cliente.telefono}</div>
          <div><span className="font-medium text-gray-600">Email:</span> {cliente.email}</div>
          <div><span className="font-medium text-gray-600">Actividad Principal:</span> {cliente.actividadPrincipal || '—'}</div>
          <div><span className="font-medium text-gray-600">Usuario / Contacto:</span> {cliente.contacto || '—'}</div>
          <div><span className="font-medium text-gray-600">Horarios de Trabajo:</span> {cliente.horarios || '—'}</div>
          <div><span className="font-medium text-gray-600">Industria:</span> <span className="capitalize">{cliente.industria || '—'}</span></div>
          <div><span className="font-medium text-gray-600">Empresa:</span> {cliente.empresa || '—'}</div>
          <div>
            <span className="font-medium text-gray-600">Estado:</span>{' '}
            <span className={`px-2 py-0.5 rounded-full text-xs ${cliente.activo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {cliente.activo ? 'Activo' : 'Inactivo'}
            </span>
          </div>
        </div>
      </div>

      {/* Tags */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Etiquetas</h2>
        <div className="flex flex-wrap gap-2 mb-3">
          {cliente.etiquetas.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs">
              {tag}
              <button onClick={() => removeTag(tag)} className="text-blue-500 hover:text-blue-800">×</button>
            </span>
          ))}
          {cliente.etiquetas.length === 0 && <p className="text-sm text-gray-500">Sin etiquetas</p>}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
            placeholder="Nueva etiqueta..."
            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm"
          />
          <button onClick={addTag} className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700">
            Agregar
          </button>
        </div>
      </div>

      {/* Contacts */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Contactos</h2>
          <button
            onClick={() => { setShowContactForm(true); setEditingContact(null); setContactForm({ nombre: '', email: '', telefono: '', cargo: '' }); }}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
          >
            Agregar contacto
          </button>
        </div>

        {(showContactForm || editingContact) && (
          <div className="mb-4 p-4 border border-gray-200 rounded-md space-y-3">
            <input
              type="text"
              placeholder="Nombre *"
              value={contactForm.nombre}
              onChange={(e) => setContactForm({ ...contactForm, nombre: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input
                type="email"
                placeholder="Email"
                value={contactForm.email}
                onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
              <input
                type="text"
                placeholder="Teléfono"
                value={contactForm.telefono}
                onChange={(e) => setContactForm({ ...contactForm, telefono: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
              <input
                type="text"
                placeholder="Cargo"
                value={contactForm.cargo}
                onChange={(e) => setContactForm({ ...contactForm, cargo: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => editingContact ? updateContact(editingContact) : addContact()}
                className="px-3 py-1.5 bg-green-600 text-white rounded-md text-sm hover:bg-green-700"
              >
                {editingContact ? 'Actualizar' : 'Guardar'}
              </button>
              <button
                onClick={() => { setShowContactForm(false); setEditingContact(null); }}
                className="px-3 py-1.5 border border-gray-300 rounded-md text-sm text-gray-700"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {cliente.contactos && cliente.contactos.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {cliente.contactos.map((c) => (
              <div key={c.id} className="py-3 flex items-center justify-between">
                <div className="text-sm">
                  <p className="font-medium text-gray-800">{c.nombre} {c.cargo && <span className="text-gray-500">— {c.cargo}</span>}</p>
                  <p className="text-gray-600">{c.email || ''} {c.telefono ? `· ${c.telefono}` : ''}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setEditingContact(c.id); setContactForm({ nombre: c.nombre, email: c.email || '', telefono: c.telefono || '', cargo: c.cargo || '' }); }}
                    className="text-blue-600 hover:text-blue-800 text-sm"
                  >
                    Editar
                  </button>
                  <button onClick={() => deleteContact(c.id)} className="text-red-600 hover:text-red-800 text-sm">
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">Sin contactos registrados</p>
        )}
      </div>

      {/* Documents */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Documentos</h2>
        <DocumentUpload clienteId={clienteId} documentos={cliente.documentos || []} onUpdate={fetchCliente} />
      </div>

      {/* Tickets */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Tickets Asociados</h2>
        {cliente.tickets && cliente.tickets.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {cliente.tickets.map((t) => (
              <Link key={t.id} href={`/tickets/${t.id}`} className="py-3 flex items-center justify-between hover:bg-gray-50 block px-2 rounded">
                <div className="text-sm">
                  <span className="font-medium text-gray-800">{t.formNombre || 'Ticket'}</span>
                  <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                    t.prioridad === 'alta' ? 'bg-red-100 text-red-700' :
                    t.prioridad === 'media' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>{t.prioridad}</span>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs ${stateColors[t.estado] || 'bg-gray-100 text-gray-800'}`}>{stateLabels[t.estado] || t.estado}</span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No hay tickets asociados</p>
        )}
      </div>
    </div>
  );
}
