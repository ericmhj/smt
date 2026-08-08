'use client';

import { useState, useEffect, useCallback } from 'react';
import { getAccessToken } from '@/lib/auth';
import { extractTenantSlug } from '@/lib/tenant';

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const token = getAccessToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  headers['X-Tenant-Slug'] = extractTenantSlug();
  return headers;
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return false;

    // Skip notifications when no tenant context (e.g. platform_admin on localhost)
    const tenantSlug = extractTenantSlug();
    if (!tenantSlug || tenantSlug === 'localhost') return false;

    try {
      const headers = buildHeaders();

      const res = await fetch(`${API_BASE_URL}/api/notifications`, { headers });

      // Stop polling silently if auth/permission fails (e.g. platform_admin has no tenant context)
      if (res.status === 401 || res.status === 403) return false;

      if (res.ok) {
        const data = await res.json();
        setNotifications(data.data || []);
      }

      const countRes = await fetch(`${API_BASE_URL}/api/notifications/unread-count`, { headers });

      if (countRes.status === 401 || countRes.status === 403) return false;

      if (countRes.ok) {
        const countData = await countRes.json();
        setUnreadCount(countData.count || 0);
      }
      return true;
    } catch {
      return true; // network error, keep trying
    }
  }, []);

  useEffect(() => {
    fetchNotifications();

    // Poll for new notifications every 30 seconds, stop on auth failure
    const interval = setInterval(async () => {
      const success = await fetchNotifications();
      if (success === false) {
        clearInterval(interval);
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const markAsRead = useCallback(async (id: string) => {
    const headers = buildHeaders();
    if (!headers['Authorization']) return;

    try {
      await fetch(`${API_BASE_URL}/api/notifications/${id}/read`, {
        method: 'PATCH',
        headers,
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // ignore
    }
  }, []);

  return { notifications, unreadCount, markAsRead, refresh: fetchNotifications };
}
