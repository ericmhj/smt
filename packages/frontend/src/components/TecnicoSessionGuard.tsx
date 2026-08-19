'use client';

import React, { useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSessionTimer } from '@/hooks/useSessionTimer';
import { SessionCountdown } from './SessionCountdown';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * Wraps children with session countdown logic for the "tecnico" role.
 *
 * When role === 'tecnico':
 * - Monitors user inactivity.
 * - After 1 min idle: shows countdown (remaining from 7 min).
 * - At 7 min idle: forces logout.
 * - Before token expires (< 2 min remaining): attempts a token refresh
 *   so the session stays alive while the user is actively working.
 *
 * For other roles, this component is a transparent pass-through.
 */
export function TecnicoSessionGuard({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();

  const isTecnico = user?.role === 'tecnico';

  const handleExpired = useCallback(() => {
    // Call logout API (fire-and-forget) then clear local state
    const token = localStorage.getItem('access_token');
    if (token) {
      const tenantSlug = user?.tenantSlug || 'default';
      fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Tenant-Slug': tenantSlug,
        },
      }).catch(() => {
        // Best effort — token will expire server-side anyway
      });
    }
    logout();
  }, [logout, user?.tenantSlug]);

  const handleRefreshNeeded = useCallback(() => {
    const refresh = localStorage.getItem('refresh_token');
    if (!refresh) return;

    const tenantSlug = user?.tenantSlug || 'default';

    fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-Slug': tenantSlug,
      },
      body: JSON.stringify({ refreshToken: refresh }),
    })
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json();
        localStorage.setItem('access_token', data.accessToken);
        if (data.refreshToken) {
          localStorage.setItem('refresh_token', data.refreshToken);
        }
        document.cookie = `sgr-token=${encodeURIComponent(data.accessToken)}; path=/; SameSite=Lax`;
      })
      .catch(() => {
        // If refresh fails, let the timer expire naturally → logout
      });
  }, [user?.tenantSlug]);

  const { secondsRemaining, showCountdown } = useSessionTimer({
    enabled: isTecnico,
    onExpired: handleExpired,
    onRefreshNeeded: handleRefreshNeeded,
  });

  return (
    <>
      <SessionCountdown secondsRemaining={secondsRemaining} visible={isTecnico && showCountdown} />
      {children}
    </>
  );
}
