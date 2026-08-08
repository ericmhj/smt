'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user) {
      const hostname = window.location.hostname;
      const parts = hostname.split('.');
      const isInsideTenant =
        hostname !== 'localhost' &&
        parts.length >= 2 &&
        parts[0] !== 'www' &&
        parts[parts.length - 1] === 'localhost';

      if (user.role !== 'platform_admin' || isInsideTenant) {
        router.replace('/kanban');
      }
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Cargando...</div>
      </div>
    );
  }

  if (!user || user.role !== 'platform_admin') {
    return null;
  }

  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const parts = hostname.split('.');
    const isInsideTenant =
      hostname !== 'localhost' &&
      parts.length >= 2 &&
      parts[0] !== 'www' &&
      parts[parts.length - 1] === 'localhost';
    if (isInsideTenant) return null;
  }

  return <>{children}</>;
}
