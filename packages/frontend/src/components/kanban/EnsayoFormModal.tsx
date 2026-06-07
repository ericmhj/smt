'use client';

import { useState, useRef, useEffect } from 'react';
import { api } from '@/lib/api';

interface EnsayoFormModalProps {
  reactivoId: string;
  htmlContent: string;
  initialResponses?: Record<string, unknown>;
  onClose: () => void;
  onSubmitSuccess: () => void;
}

export default function EnsayoFormModal({
  reactivoId,
  htmlContent,
  initialResponses,
  onClose,
  onSubmitSuccess,
}: EnsayoFormModalProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<string[]>([]);

  // Inject initial values after the HTML is rendered
  useEffect(() => {
    if (!formRef.current || !initialResponses) return;
    const form = formRef.current;
    for (const [key, value] of Object.entries(initialResponses)) {
      const element = form.elements.namedItem(key);
      if (element && 'value' in element) {
        (element as HTMLInputElement).value = String(value ?? '');
      }
    }
  }, [initialResponses, htmlContent]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFieldErrors([]);

    if (!formRef.current) return;

    // Collect form data
    const formData = new FormData(formRef.current);
    const responses: Record<string, unknown> = {};
    for (const [key, value] of formData.entries()) {
      responses[key] = value;
    }

    setSubmitting(true);
    try {
      await api(`/api/reactivos/${reactivoId}/submit`, {
        method: 'POST',
        body: JSON.stringify({ responses }),
      });
      onSubmitSuccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al enviar el ensayo';
      if (message.includes('Respuestas inválidas')) {
        setFieldErrors(message.replace('Respuestas inválidas: ', '').split(', '));
      } else {
        setError(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-800">Llenar Ensayo</h2>
          <button
            onClick={onClose}
            disabled={submitting}
            className="text-gray-400 hover:text-gray-600 text-xl font-bold"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md text-sm">{error}</div>
          )}
          {fieldErrors.length > 0 && (
            <div className="mb-4 p-3 bg-yellow-50 text-yellow-800 rounded-md text-sm">
              <p className="font-medium mb-1">Campos con errores:</p>
              <ul className="list-disc list-inside">
                {fieldErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          <form
            ref={formRef}
            onSubmit={handleSubmit}
            id="ensayo-form"
            className="ensayo-form-container"
          >
            <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
          </form>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 text-sm"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="ensayo-form"
            disabled={submitting}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm"
          >
            {submitting ? 'Enviando...' : 'Enviar Ensayo'}
          </button>
        </div>
      </div>
    </div>
  );
}
