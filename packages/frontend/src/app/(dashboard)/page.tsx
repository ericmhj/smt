'use client';

import { useAuth } from '@/contexts/AuthContext';

export default function DashboardHome() {
  const { user } = useAuth();

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-4">
        Bienvenido, {user?.email || 'Usuario'}
      </h1>
      <p className="text-gray-600">
        Selecciona una opción del menú lateral para comenzar.
      </p>
    </div>
  );
}
