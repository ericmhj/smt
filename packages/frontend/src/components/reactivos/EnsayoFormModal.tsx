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

interface ValidationError {
  field: string;
  message: string;
}

export default function EnsayoFormModal({
  reactivoId,
  htmlContent,
  initialResponses,
  onClose,
  onSubmitSuccess,
}: EnsayoFormModalProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [generalError, setGeneralError] = useState<string | null>(null);

  // Inject initial values into form fields after render
  useEffect(() => {
    if (!formRef.current || !initialResponses) return;

    const form = formRef.current;
    Object.entries(initialResponses).forEach(([key, value]) => {
      const element = form.elements.namedItem(key);
      if (!element) return;

      if (element instanceof HTMLInputElement) {
        if (element.type === 'checkbox') {
          element.checked = Boolean(value);
        } else if (element.type === 'radio') {
          // Handle radio groups
          const radios = form.querySelectorAll<HTMLInputElement>(`input[name="${key}"]`);
          radios.forEach((radio) => {
            radio.checked = radio.value === String(value);
          });
        } else {
          element.value = String(value ?? '');
        }
      } else if (element instanceof HTMLSelectElement) {
        element.value = String(value ?? '');
      } else if (element instanceof HTMLTextAreaElement) {
        element.value = String(value ?? '');
      }
    });
  }, [initialResponses]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formRef.current) return;

    setLoading(true);
    setErrors([]);
    setGeneralError(null);

    // Collect form data
    const formData = new FormData(formRef.current);
    const responses: Record<string, unknown> = {};

    formData.forEach((value, key) => {
      // Handle numeric values
      const numVal = Number(value);
      if (value !== '' && !isNaN(numVal) && typeof value === 'string' && value.trim() === String(numVal)) {
        responses[key] = numVal;
      } else {
        responses[key] = value;
      }
    });

    // Handle checkboxes that are unchecked (not in FormData)
    const checkboxes = formRef.current.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    checkboxes.forEach((cb) => {
      if (!formData.has(cb.name)) {
        responses[cb.name] = false;
      } else {
        responses[cb.name] = true;
      }
    });

    try {
      await api(`/api/reactivos/${reactivoId}/submit`, {
        method: 'POST',
        body: JSON.stringify({ responses }),
        headers: { 'Content-Type': 'application/json' },
      });
      onSubmitSuccess();
    } catch (error: unknown) {
      // Try to parse the error for field-specific validation messages
      if (error instanceof Error) {
        const message = error.message;
        // Check if it's a validation error with field info
        if (message.includes('Respuestas inválidas:')) {
          const fieldErrors = message
            .replace('Respuestas inválidas: ', '')
            .split(', ')
            .map((err) => {
              const [field, ...rest] = err.split(': ');
              return { field: field || '', message: rest.join(': ') || err };
            });
          setErrors(fieldErrors);
        } else {
          setGeneralError(message);
        }
      } else {
        setGeneralError('Error de conexión');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-2xl w-[90vw] max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="text-lg font-semibold text-gray-800">Formulario de Ensayo</h3>
          <button
            onClick={onClose}
            disabled={loading}
            className="px-3 py-1 bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 text-sm font-medium disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>

        {/* Form body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {generalError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
              {generalError}
            </div>
          )}

          {errors.length > 0 && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm font-medium text-red-700 mb-1">Errores de validación:</p>
              <ul className="text-sm text-red-600 list-disc list-inside">
                {errors.map((err, idx) => (
                  <li key={idx}>
                    <span className="font-medium">{err.field}</span>: {err.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <form ref={formRef} onSubmit={handleSubmit}>
            <div
              dangerouslySetInnerHTML={{ __html: htmlContent }}
            />
          </form>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm font-medium disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => formRef.current?.requestSubmit()}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium disabled:opacity-50 flex items-center gap-2"
          >
            {loading && (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}
            {loading ? 'Enviando...' : 'Enviar Ensayo'}
          </button>
        </div>
      </div>
    </div>
  );
}
