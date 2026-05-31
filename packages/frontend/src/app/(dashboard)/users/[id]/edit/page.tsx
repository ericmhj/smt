'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import UserForm from '@/components/users/UserForm';

export default function EditUserPage() {
  const params = useParams();
  const [userData, setUserData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const data = await api<Record<string, unknown>>(`/api/users/${params.id}`);
        setUserData(data);
      } catch {
        setUserData(null);
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
  }, [params.id]);

  const handleSubmit = async (data: Record<string, unknown>) => {
    await api(`/api/users/${params.id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  };

  if (loading) return <p className="text-gray-500">Cargando...</p>;
  if (!userData) return <p className="text-red-500">Usuario no encontrado.</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Editar usuario</h1>
      <div className="bg-white rounded-lg shadow p-6">
        <UserForm initialData={userData} isEdit onSubmit={handleSubmit} />
      </div>
    </div>
  );
}
