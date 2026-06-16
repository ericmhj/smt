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
  const containerRef = useRef<HTMLDivElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<string[]>([]);

  // Strip <form> tags from HTML to avoid nested forms
  const strippedHtml = htmlContent
    .replace(/<form[^>]*>/gi, '')
    .replace(/<\/form>/gi, '');

  // Inject initial values after the HTML is rendered
  useEffect(() => {
    if (!containerRef.current || !initialResponses) return;
    const timer = setTimeout(() => {
      const container = containerRef.current;
      if (!container) return;
      for (const [key, value] of Object.entries(initialResponses)) {
        const element = container.querySelector(`[name="${key}"]`) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
        if (element) {
          element.value = String(value ?? '');
        }
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [initialResponses, strippedHtml]);

  const handleSubmit = async () => {
    setError('');
    setFieldErrors([]);

    if (!containerRef.current) return;

    // Collect form data from all named inputs in the container
    const inputs = containerRef.current.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('[name]');
    const responses: Record<string, unknown> = {};
    inputs.forEach((el) => {
      if (el.name) {
        responses[el.name] = el.value;
      }
    });

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
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
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

          <div
            ref={containerRef}
            className="ensayo-form-container"
            dangerouslySetInnerHTML={{ __html: strippedHtml }}
          />
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
            type="button"
            onClick={handleSubmit}
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
