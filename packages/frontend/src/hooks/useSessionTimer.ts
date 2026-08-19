'use client';

import { useEffect, useRef, useCallback, useState } from 'react';

/**
 * Session timer hook for the "tecnico" role.
 *
 * Behavior:
 * - Total session timeout: 7 minutes (420 seconds) of inactivity.
 * - On any user interaction (input, click, keydown, scroll): resets timer to 7 min.
 * - The countdown UI hides immediately on activity.
 * - After 1 minute of inactivity: the countdown UI appears showing remaining time.
 * - When timer reaches 0: fires onExpired callback (logout).
 * - Auto-refresh: when token is about to expire (< 2 min left) and user is active,
 *   triggers a token refresh.
 */

const SESSION_TIMEOUT_SECONDS = 420; // 7 minutes
const SHOW_COUNTDOWN_AFTER_SECONDS = 60; // Show after 1 min of inactivity
const REFRESH_THRESHOLD_SECONDS = 120; // Refresh token when < 2 min remain

export interface UseSessionTimerOptions {
  enabled: boolean;
  onExpired: () => void;
  onRefreshNeeded: () => void;
}

export interface UseSessionTimerReturn {
  /** Seconds remaining before session expires */
  secondsRemaining: number;
  /** Whether the countdown should be visible */
  showCountdown: boolean;
  /** Manually reset the timer (e.g., after successful refresh) */
  resetTimer: () => void;
}

export function useSessionTimer({
  enabled,
  onExpired,
  onRefreshNeeded,
}: UseSessionTimerOptions): UseSessionTimerReturn {
  const [secondsRemaining, setSecondsRemaining] = useState(SESSION_TIMEOUT_SECONDS);
  const [showCountdown, setShowCountdown] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const refreshRequestedRef = useRef(false);
  const onExpiredRef = useRef(onExpired);
  const onRefreshNeededRef = useRef(onRefreshNeeded);

  // Keep callback refs up to date
  useEffect(() => {
    onExpiredRef.current = onExpired;
    onRefreshNeededRef.current = onRefreshNeeded;
  }, [onExpired, onRefreshNeeded]);

  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    refreshRequestedRef.current = false;
    setSecondsRemaining(SESSION_TIMEOUT_SECONDS);
    setShowCountdown(false);
  }, []);

  // Handle user activity events
  useEffect(() => {
    if (!enabled) return;

    const handleActivity = () => {
      lastActivityRef.current = Date.now();
      refreshRequestedRef.current = false;
      setShowCountdown(false);
      setSecondsRemaining(SESSION_TIMEOUT_SECONDS);
    };

    const events = ['input', 'click', 'keydown', 'scroll', 'touchstart', 'mousemove'];

    events.forEach((event) => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    return () => {
      events.forEach((event) => {
        document.removeEventListener(event, handleActivity);
      });
    };
  }, [enabled]);

  // Tick every second
  useEffect(() => {
    if (!enabled) return;

    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - lastActivityRef.current) / 1000);
      const remaining = Math.max(0, SESSION_TIMEOUT_SECONDS - elapsed);

      setSecondsRemaining(remaining);

      // Show countdown after 1 min of inactivity
      if (elapsed >= SHOW_COUNTDOWN_AFTER_SECONDS) {
        setShowCountdown(true);
      }

      // Request token refresh when running low
      if (remaining <= REFRESH_THRESHOLD_SECONDS && remaining > 0 && !refreshRequestedRef.current) {
        refreshRequestedRef.current = true;
        onRefreshNeededRef.current();
      }

      // Session expired
      if (remaining <= 0) {
        onExpiredRef.current();
      }
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [enabled]);

  return { secondsRemaining, showCountdown, resetTimer };
}
