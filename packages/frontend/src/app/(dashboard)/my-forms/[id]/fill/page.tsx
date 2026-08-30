'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';

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
  // Número de informe (viene del ticket). Si está presente, se muestra en el formulario.
  const informeNo = searchParams.get('informeNo');

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

  const handleOpenForm = () => {
    const token = localStorage.getItem('access_token') || '';
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    // Open form in new window — the render endpoint serves full HTML with submit logic
    const informeParam = informeNo ? `?informeNo=${encodeURIComponent(informeNo)}` : '';
    const url = `${apiUrl}/api/forms/${formDetail.id}/render${informeParam}`;
    const win = window.open('about:blank', '_blank');
    if (win) {
      // Fetch with auth and write HTML to the new window
      fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Tenant-Slug': window.location.hostname.split('.')[0] || 'default',
        },
      })
        .then(res => res.text())
        .then(html => {
          win.document.open();
          win.document.write(html);
          win.document.close();
        })
        .catch(() => {
          win.document.write('<h1>Error al cargar el formulario</h1>');
        });
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-2">{formDetail.name}</h1>
      <p className="text-sm text-gray-500 mb-6">Versión: v{formDetail.currentVersion}</p>

      {error && (
        <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md mb-4">{error}</div>
      )}

      <div className="bg-white rounded-lg shadow p-6 text-center">
        <p className="text-gray-600 mb-4">El formulario se abrirá en una nueva ventana con todas sus funcionalidades interactivas.</p>
        <button
          onClick={handleOpenForm}
          className="px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 font-medium text-lg"
        >
          Abrir Formulario
        </button>
        <p className="text-xs text-gray-400 mt-3">Al enviar el formulario, la ventana se cerrará automáticamente.</p>
      </div>
    </div>
  );
}
