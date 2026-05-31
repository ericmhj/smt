'use client';

import { api } from '@/lib/api';
import UserForm from '@/components/users/UserForm';

export default function NewUserPage() {
  const handleSubmit = async (data: { email: string; name: string; password?: string; role: string }) => {
    await api('/api/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Crear usuario</h1>
      <div className="bg-white rounded-lg shadow p-6">
        <UserForm onSubmit={handleSubmit} />
      </div>
    </div>
  );
}
