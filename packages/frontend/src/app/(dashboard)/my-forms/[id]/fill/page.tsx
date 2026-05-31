'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import DynamicForm from '@/components/forms/DynamicForm';

interface FormData {
  assignmentId: string;
  formName: string;
  htmlContent: string;
  formVersion: number;
}

export default function FillFormPage() {
  const params = useParams();
  const router = useRouter();
  const [formData, setFormData] = useState<FormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchForm = async () => {
      try {
        const data = await api<FormData>(`/api/assignments/${params.id}/form`);
        setFormData(data);
      } catch {
        setFormData(null);
      } finally {
        setLoading(false);
      }
    };
    fetchForm();
  }, [params.id]);

  const handleSubmit = async (responses: Record<string, unknown>) => {
    setError('');
    setSubmitting(true);

    try {
      await api('/api/reactivos', {
        method: 'POST',
        body: JSON.stringify({
          assignmentId: params.id,
          responses,
        }),
      });
      router.push('/my-reactivos');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al enviar formulario');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <p className="text-gray-500">Cargando formulario...</p>;
  if (!formData) return <p className="text-red-500">Formulario no encontrado.</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-2">{formData.formName}</h1>
      <p className="text-sm text-gray-500 mb-6">Versión: v{formData.formVersion}</p>

      {error && (
        <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md mb-4">{error}</div>
      )}

      <div className="bg-white rounded-lg shadow p-6">
        <DynamicForm
          htmlContent={formData.htmlContent}
          onSubmit={handleSubmit}
          submitting={submitting}
        />
      </div>
    </div>
  );
}
