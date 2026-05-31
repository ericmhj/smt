'use client';

import { useState } from 'react';
import { apiUpload } from '@/lib/api';

interface ObservationFormProps {
  reactivoId: string;
  onSuccess: () => void;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'application/pdf', 'image/gif'];

export default function ObservationForm({ reactivoId, onSuccess }: ObservationFormProps) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    const errors: string[] = [];

    const valid = selected.filter((file) => {
      if (file.size > MAX_FILE_SIZE) {
        errors.push(`${file.name}: excede 10MB`);
        return false;
      }
      if (!ALLOWED_TYPES.includes(file.type)) {
        errors.push(`${file.name}: formato no permitido`);
        return false;
      }
      return true;
    });

    if (errors.length > 0) {
      setError(errors.join(', '));
    }
    setFiles(valid);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) {
      setError('El texto es obligatorio');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('text', text);
      formData.append('reactivoId', reactivoId);
      files.forEach((file) => formData.append('files', file));

      await apiUpload(`/api/observations`, formData);
      setText('');
      setFiles([]);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al enviar observación');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && (
        <div className="bg-red-50 text-red-600 text-sm p-2 rounded-md">{error}</div>
      )}

      <div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          required
          placeholder="Escriba su observación..."
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <input
          type="file"
          multiple
          accept={ALLOWED_TYPES.join(',')}
          onChange={handleFileChange}
          className="text-sm text-gray-500"
        />
        <p className="text-xs text-gray-400 mt-1">Máx. 10MB por archivo. PNG, JPG, PDF, GIF.</p>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm"
      >
        {loading ? 'Enviando...' : 'Enviar observación'}
      </button>
    </form>
  );
}
