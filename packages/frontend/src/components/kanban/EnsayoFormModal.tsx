'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { api, ApiError } from '@/lib/api';
import { FORM_STYLES } from '@/lib/form-styles';

interface ValidationError {
  fieldName: string;
  sectionName: string;
  ruleName: string;
  message: string;
  ruleType: 'global' | 'custom';
}

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
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);

  // Strip <form> tags from HTML to avoid nested forms
  const strippedHtml = htmlContent
    .replace(/<form[^>]*>/gi, '')
    .replace(/<\/form>/gi, '');

  // The HTML already contains its own <style> block with original form styles
  const styledHtml = strippedHtml;

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

  // Apply visual error indicators to the DOM
  const applyValidationErrorsToDOM = useCallback((errors: ValidationError[]) => {
    const container = containerRef.current;
    if (!container) return;

    for (const err of errors) {
      const element = container.querySelector(`[name="${err.fieldName}"]`) as HTMLElement | null;
      if (element) {
        element.classList.add('field-error-border');
        // Create and inject the error message div
        const errorDiv = document.createElement('div');
        errorDiv.className = 'field-error';
        errorDiv.setAttribute('data-field-error', err.fieldName);
        errorDiv.textContent = err.message;
        element.insertAdjacentElement('afterend', errorDiv);
      }
    }

    // Scroll to the first errored field
    if (errors.length > 0) {
      const firstField = container.querySelector(`[name="${errors[0].fieldName}"]`) as HTMLElement | null;
      if (firstField) {
        firstField.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, []);

  // Clear visual error indicators from a specific field
  const clearFieldError = useCallback((fieldName: string) => {
    const container = containerRef.current;
    if (!container) return;

    const element = container.querySelector(`[name="${fieldName}"]`) as HTMLElement | null;
    if (element) {
      element.classList.remove('field-error-border');
    }
    const errorDiv = container.querySelector(`[data-field-error="${fieldName}"]`);
    if (errorDiv) {
      errorDiv.remove();
    }
  }, []);

  // Clear all visual error indicators
  const clearAllErrors = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    container.querySelectorAll('.field-error-border').forEach((el) => {
      el.classList.remove('field-error-border');
    });
    container.querySelectorAll('.field-error').forEach((el) => {
      el.remove();
    });
  }, []);

  // Listen for field changes to clear individual errors
  useEffect(() => {
    const container = containerRef.current;
    if (!container || validationErrors.length === 0) return;

    const handleFieldChange = (e: Event) => {
      const target = e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      if (!target || !target.name) return;

      const hasError = validationErrors.some((err) => err.fieldName === target.name);
      if (hasError) {
        clearFieldError(target.name);
        setValidationErrors((prev) => prev.filter((err) => err.fieldName !== target.name));
      }
    };

    container.addEventListener('input', handleFieldChange);
    container.addEventListener('change', handleFieldChange);

    return () => {
      container.removeEventListener('input', handleFieldChange);
      container.removeEventListener('change', handleFieldChange);
    };
  }, [validationErrors, clearFieldError]);

  const handleSubmit = async () => {
    setError('');
    setFieldErrors([]);
    setValidationErrors([]);
    clearAllErrors();

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
      if (err instanceof ApiError && err.status === 422 && Array.isArray(err.data.errors)) {
        const errors = err.data.errors as ValidationError[];
        setValidationErrors(errors);
        // Apply visual indicators after state update
        setTimeout(() => applyValidationErrorsToDOM(errors), 0);
      } else {
        const message = err instanceof Error ? err.message : 'Error al enviar el ensayo';
        if (message.includes('Respuestas inválidas')) {
          setFieldErrors(message.replace('Respuestas inválidas: ', '').split(', '));
        } else {
          setError(message);
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Compute per-section error counts for summary footer
  const sectionErrorCounts = validationErrors.reduce<Record<string, number>>((acc, err) => {
    acc[err.sectionName] = (acc[err.sectionName] || 0) + 1;
    return acc;
  }, {});

  const hasValidationErrors = validationErrors.length > 0;

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

          <style dangerouslySetInnerHTML={{ __html: `
            .field-error-border { border-color: #ef4444 !important; background: #fef2f2 !important; }
            .field-error { color: #dc2626; font-size: 11px; margin-top: 2px; padding: 2px 4px; }
          ` }} />

          <div
            ref={containerRef}
            className="prose prose-sm max-w-none [&_input]:border [&_input]:border-gray-300 [&_input]:rounded [&_input]:px-2 [&_input]:py-1 [&_input]:w-full [&_input]:mb-3 [&_select]:border [&_select]:border-gray-300 [&_select]:rounded [&_select]:px-2 [&_select]:py-1 [&_select]:w-full [&_select]:mb-3 [&_textarea]:border [&_textarea]:border-gray-300 [&_textarea]:rounded [&_textarea]:px-2 [&_textarea]:py-1 [&_textarea]:w-full [&_textarea]:mb-3 [&_label]:font-medium [&_label]:text-gray-700 [&_label]:block [&_label]:mb-1 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-gray-300 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-gray-300 [&_th]:px-2 [&_th]:py-1 [&_th]:bg-gray-50"
            dangerouslySetInnerHTML={{ __html: styledHtml }}
          />
        </div>

        {/* Validation Error Summary Footer */}
        {hasValidationErrors && (
          <div className="px-6 py-3 bg-red-50 border-t border-red-200">
            <p className="text-sm font-medium text-red-800 mb-1">
              Errores de validación ({validationErrors.length}):
            </p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(sectionErrorCounts).map(([section, count]) => (
                <span
                  key={section}
                  className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800"
                >
                  {section}: {count}
                </span>
              ))}
            </div>
          </div>
        )}

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
            disabled={submitting || hasValidationErrors}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm"
          >
            {submitting ? 'Enviando...' : 'Enviar Ensayo'}
          </button>
        </div>
      </div>
    </div>
  );
}
