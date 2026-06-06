'use client';

import { useState, useRef } from 'react';
import { api, apiUpload } from '@/lib/api';

interface Documento {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  uploadedBy?: string;
}

interface DocumentUploadProps {
  clienteId: string;
  documentos: Documento[];
  onUpdate: () => void;
}

const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentUpload({ clienteId, documentos, onUpdate }: DocumentUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!ALLOWED_EXTENSIONS.includes(ext) && !ALLOWED_TYPES.includes(file.type)) {
      return `Formato no permitido: .${ext}. Formatos aceptados: ${ALLOWED_EXTENSIONS.join(', ')}`;
    }
    if (file.size > MAX_SIZE) {
      return `El archivo excede el tamaño máximo de 10MB (${formatSize(file.size)})`;
    }
    return null;
  };

  const uploadFile = async (file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError('');
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await apiUpload(`/api/clientes/${clienteId}/documentos`, formData);
      onUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al subir archivo');
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  };

  const handleDelete = async (docId: string) => {
    if (!confirm('¿Eliminar este documento?')) return;
    try {
      await api(`/api/clientes/${clienteId}/documentos/${docId}`, { method: 'DELETE' });
      onUpdate();
    } catch { /* ignore */ }
  };

  const handleDownload = async (doc: Documento) => {
    try {
      const res = await api<{ url: string }>(`/api/clientes/${clienteId}/documentos/${doc.id}/download`);
      window.open(res.url, '_blank');
    } catch {
      // Fallback: open download endpoint directly
      const url = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/clientes/${clienteId}/documentos/${doc.id}/download`;
      window.open(url, '_blank');
    }
  };

  return (
    <div className="space-y-4">
      {/* Upload Area */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
          dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
        }`}
      >
        <p className="text-sm text-gray-600 mb-2">
          {uploading ? 'Subiendo...' : 'Arrastra un archivo aquí o'}
        </p>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          Seleccionar archivo
        </button>
        <p className="text-xs text-gray-500 mt-2">
          Formatos: PDF, JPG, PNG, DOC, DOCX — Máximo: 10MB
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {error && (
        <div className="p-3 bg-red-50 text-red-700 rounded-md text-sm">{error}</div>
      )}

      {/* Document List */}
      {documentos.length > 0 && (
        <div className="divide-y divide-gray-100">
          {documentos.map((doc) => (
            <div key={doc.id} className="py-3 flex items-center justify-between">
              <div className="text-sm">
                <p className="font-medium text-gray-800">{doc.originalName}</p>
                <p className="text-gray-500">{formatSize(doc.sizeBytes)} · {new Date(doc.createdAt).toLocaleDateString('es')}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleDownload(doc)}
                  className="text-blue-600 hover:text-blue-800 text-sm"
                >
                  Descargar
                </button>
                <button
                  onClick={() => handleDelete(doc.id)}
                  className="text-red-600 hover:text-red-800 text-sm"
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {documentos.length === 0 && (
        <p className="text-sm text-gray-500">No hay documentos adjuntos</p>
      )}
    </div>
  );
}
