'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import FormList from '@/components/forms/FormList';

export interface FormItem {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  currentVersion: number;
  templateId?: string | null;
  formType?: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function FormsPage() {
  const [forms, setForms] = useState<FormItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const fetchForms = async () => {
    setLoading(true);
    try {
      const response = await api<{ data: FormItem[] }>('/api/forms');
      setForms(response.data || []);
    } catch {
      setForms([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchForms();
  }, []);

  const handleToggleActive = async (id: string, isActive: boolean) => {
    try {
      const action = isActive ? 'activate' : 'deactivate';
      await api(`/api/forms/${id}/${action}`, {
        method: 'PATCH',
      });
      fetchForms();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api(`/api/forms/${id}`, { method: 'DELETE' });
      fetchForms();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al eliminar');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Formularios</h1>
        {user && (user.role === 'superusuario' || user.role === 'admin') && (
          <Link
            href="/forms/new"
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Nuevo formulario
          </Link>
        )}
      </div>

      {loading ? (
        <p className="text-gray-500">Cargando...</p>
      ) : (
        <FormList
          forms={forms}
          onToggleActive={handleToggleActive}
          onDelete={handleDelete}
          userRole={user?.role}
        />
      )}
    </div>
  );
}
