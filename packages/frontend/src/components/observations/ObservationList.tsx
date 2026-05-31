'use client';

import { api } from '@/lib/api';
import FileAttachment from './FileAttachment';

interface Observation {
  id: string;
  text: string;
  authorName: string;
  isRead: boolean;
  createdAt: string;
  files: Array<{
    id: string;
    fileName: string;
    fileUrl: string;
    fileType: string;
  }>;
}

interface ObservationListProps {
  observations: Observation[];
  showMarkAsRead?: boolean;
  onUpdate?: () => void;
}

export default function ObservationList({ observations, showMarkAsRead, onUpdate }: ObservationListProps) {
  const handleMarkAsRead = async (id: string) => {
    try {
      await api(`/api/observations/${id}/read`, { method: 'PATCH' });
      onUpdate?.();
    } catch {
      // ignore
    }
  };

  if (observations.length === 0) {
    return <p className="text-sm text-gray-500">Sin observaciones.</p>;
  }

  return (
    <div className="space-y-3">
      {observations.map((obs) => (
        <div
          key={obs.id}
          className={`border rounded-md p-3 ${obs.isRead ? 'bg-white border-gray-200' : 'bg-blue-50 border-blue-200'}`}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-800">{obs.text}</p>
              <p className="text-xs text-gray-500 mt-1">
                {obs.authorName} • {new Date(obs.createdAt).toLocaleString('es')}
              </p>
            </div>
            {showMarkAsRead && !obs.isRead && (
              <button
                onClick={() => handleMarkAsRead(obs.id)}
                className="text-xs text-blue-600 hover:text-blue-800 whitespace-nowrap"
              >
                Marcar leída
              </button>
            )}
          </div>

          {obs.files.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {obs.files.map((file) => (
                <FileAttachment
                  key={file.id}
                  fileName={file.fileName}
                  fileUrl={file.fileUrl}
                  fileType={file.fileType}
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
