'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import DynamicForm from '@/components/forms/DynamicForm';

interface FormDetail {
  id: string;
  name: string;
  currentVersion: number;
  currentVersionData: {
    htmlContent: string;
    sanitizedHtml: string;
  };
}

export default function FillFormPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [formDetail, setFormDetail] = useState<FormDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // The params.id is the assignment ID, formId comes from the link's query param
  const formId = searchParams.get('formId') || params.id;

  useEffect(() => {
    const fetchForm = async () => {
      try {
        // Try to get form detail directly
        const data = await api<FormDetail>(`/api/forms/${formId}`);
        setFormDetail(data);
      } catch {
        setFormDetail(null);
      } finally {
        setLoading(false);
      }
    };
    fetchForm();
  }, [formId]);

  const handleSubmit = async (responses: Record<string, unknown>) => {
    setError('');
    setSubmitting(true);

    try {
      await api('/api/reactivos', {
        method: 'POST',
        body: JSON.stringify({
          formId: formDetail?.id || formId,
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
  if (!formDetail) return <p className="text-red-500">Formulario no encontrado.</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-2">{formDetail.name}</h1>
      <p className="text-sm text-gray-500 mb-6">Versión: v{formDetail.currentVersion}</p>

      {error && (
        <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md mb-4">{error}</div>
      )}

      <div className="bg-white rounded-lg shadow p-6">
        <DynamicForm
          htmlContent={formDetail.currentVersionData?.htmlContent || ''}
          onSubmit={handleSubmit}
          submitting={submitting}
        />
      </div>
    </div>
  );
}
