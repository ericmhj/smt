'use client';

import { useEffect } from 'react';

interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info';
  onClose: () => void;
  duration?: number;
}

export default function Toast({ message, type, onClose, duration = 4000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  const bgColor = type === 'success'
    ? 'bg-green-600'
    : type === 'error'
      ? 'bg-red-600'
      : 'bg-blue-600';

  return (
    <div className={`fixed bottom-4 right-4 z-[60] ${bgColor} text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 max-w-sm`}>
      <p className="text-sm">{message}</p>
      <button onClick={onClose} className="text-white/70 hover:text-white text-lg font-bold">×</button>
    </div>
  );
}
