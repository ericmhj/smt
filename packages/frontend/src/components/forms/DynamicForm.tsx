'use client';

import { useRef, useState } from 'react';
import { FORM_STYLES } from '@/lib/form-styles';

interface DynamicFormProps {
  htmlContent: string;
  onSubmit: (responses: Record<string, unknown>) => void;
  submitting?: boolean;
}

export default function DynamicForm({ htmlContent, onSubmit, submitting }: DynamicFormProps) {
  const formRef = useRef<HTMLDivElement>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // The HTML already contains its own <style> block with original form styles
  const styledHtml = htmlContent;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationErrors([]);

    if (!formRef.current) return;

    const inputs = formRef.current.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      'input, select, textarea'
    );

    const responses: Record<string, unknown> = {};
    const errors: string[] = [];

    inputs.forEach((input) => {
      const name = input.getAttribute('name');
      if (!name) return;

      if (input instanceof HTMLInputElement && input.type === 'checkbox') {
        responses[name] = input.checked;
      } else if (input instanceof HTMLInputElement && input.type === 'radio') {
        if (input.checked) {
          responses[name] = input.value;
        }
      } else if (input instanceof HTMLInputElement && (input.type === 'number' || input.type === 'range')) {
        responses[name] = input.value === '' ? undefined : Number(input.value);
      } else {
        responses[name] = input.value;
      }

      // Basic required validation
      if (input.hasAttribute('required') && !input.value) {
        errors.push(`El campo "${name}" es obligatorio`);
      }
    });

    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }

    onSubmit(responses);
  };

  return (
    <form onSubmit={handleSubmit} className="relative">
      {/* Loading overlay */}
      {submitting && (
        <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-50 rounded-lg">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            <p className="text-sm font-medium text-gray-600">Guardando formulario...</p>
          </div>
        </div>
      )}

      {validationErrors.length > 0 && (
        <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md mb-4">
          <ul className="list-disc list-inside">
            {validationErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      <div
        ref={formRef}
        className="mb-6"
        dangerouslySetInnerHTML={{ __html: styledHtml }}
      />

      <div className="flex gap-3 pt-4 border-t">
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? 'Enviando...' : 'Enviar formulario'}
        </button>
      </div>
    </form>
  );
}
