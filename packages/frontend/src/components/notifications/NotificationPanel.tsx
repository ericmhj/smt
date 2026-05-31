'use client';

import { Notification } from '@/hooks/useNotifications';

interface NotificationPanelProps {
  notifications: Notification[];
  onMarkAsRead: (id: string) => void;
  onClose: () => void;
}

export default function NotificationPanel({ notifications, onMarkAsRead, onClose }: NotificationPanelProps) {
  return (
    <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="text-sm font-semibold text-gray-700">Notificaciones</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          ✕
        </button>
      </div>

      <div className="max-h-96 overflow-y-auto">
        {notifications.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">Sin notificaciones</p>
        ) : (
          notifications.map((n) => (
            <div
              key={n.id}
              className={`px-4 py-3 border-b last:border-b-0 ${
                n.isRead ? 'bg-white' : 'bg-blue-50'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{n.title}</p>
                  <p className="text-xs text-gray-600 mt-0.5">{n.message}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(n.createdAt).toLocaleString('es')}
                  </p>
                </div>
                {!n.isRead && (
                  <button
                    onClick={() => onMarkAsRead(n.id)}
                    className="text-xs text-blue-600 hover:text-blue-800 ml-2 whitespace-nowrap"
                  >
                    Leída
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
