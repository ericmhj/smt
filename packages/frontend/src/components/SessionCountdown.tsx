'use client';

import React from 'react';

interface SessionCountdownProps {
  secondsRemaining: number;
  visible: boolean;
}

/**
 * Visual countdown timer that shows remaining session time.
 * Appears after 1 minute of inactivity for the "tecnico" role.
 * Displays in a fixed position at the top-right corner.
 */
export function SessionCountdown({ secondsRemaining, visible }: SessionCountdownProps) {
  if (!visible) return null;

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  const isUrgent = secondsRemaining <= 60;
  const isWarning = secondsRemaining <= 120 && !isUrgent;

  return (
    <div
      role="timer"
      aria-live="polite"
      aria-label={`La sesión expira en ${minutes} minutos y ${seconds} segundos`}
      className={`
        fixed top-4 right-4 z-50
        flex items-center gap-2 px-4 py-2
        rounded-lg shadow-lg border
        transition-all duration-300 ease-in-out
        animate-in fade-in slide-in-from-top-2
        ${isUrgent
          ? 'bg-red-50 border-red-300 text-red-800'
          : isWarning
            ? 'bg-amber-50 border-amber-300 text-amber-800'
            : 'bg-slate-50 border-slate-300 text-slate-700'
        }
      `}
    >
      {/* Clock icon */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className={`h-5 w-5 ${isUrgent ? 'text-red-500 animate-pulse' : isWarning ? 'text-amber-500' : 'text-slate-500'}`}
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.828a1 1 0 101.415-1.414L11 9.586V6z"
          clipRule="evenodd"
        />
      </svg>

      <div className="flex flex-col">
        <span className="text-xs font-medium leading-none">
          {isUrgent ? 'Sesión por expirar' : 'Tiempo restante'}
        </span>
        <span className={`text-lg font-mono font-bold leading-tight ${isUrgent ? 'animate-pulse' : ''}`}>
          {timeString}
        </span>
      </div>
    </div>
  );
}
