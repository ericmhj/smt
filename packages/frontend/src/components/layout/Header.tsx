'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/hooks/useNotifications';
import { getStoredTenant } from '@/lib/token-storage';
import NotificationBadge from '@/components/notifications/NotificationBadge';
import NotificationPanel from '@/components/notifications/NotificationPanel';

const roleLabels: Record<string, string> = {
  superusuario: 'Superusuario',
  admin: 'Administrador',
  manager: 'Manager',
  tecnico: 'Técnico',
  asistente: 'Asistente',
};

export default function Header() {
  const { user, logout } = useAuth();
  const { notifications, unreadCount, markAsRead } = useNotifications();
  const [showNotifications, setShowNotifications] = useState(false);
  const [tenantName, setTenantName] = useState('');

  useEffect(() => {
    setTenantName(getStoredTenant()?.nombre || '');
  }, []);

  if (!user) return null;

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
      <div className="flex-1" />
      <p className="flex-1 text-center text-3xl font-bold text-gray-800 truncate">
        {tenantName}
      </p>
      <div className="flex flex-1 items-center justify-end gap-4">
        <div className="relative">
          <NotificationBadge
            count={unreadCount}
            onClick={() => setShowNotifications(!showNotifications)}
          />
          {showNotifications && (
            <NotificationPanel
              notifications={notifications}
              onMarkAsRead={markAsRead}
              onClose={() => setShowNotifications(false)}
            />
          )}
        </div>
        <div className="text-right">
          <p className="text-sm font-medium text-gray-700">{user.name}</p>
          <p className="text-xs text-gray-500">{roleLabels[user.role] || user.role}</p>
        </div>
        <button
          onClick={logout}
          className="px-3 py-1.5 text-sm bg-red-50 text-red-600 rounded-md hover:bg-red-100 transition-colors"
        >
          Cerrar sesión
        </button>
      </div>
    </header>
  );
}
