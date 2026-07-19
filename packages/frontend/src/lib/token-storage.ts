'use client';

export interface StoredUser {
  id: string;
  name: string;
  email: string;
  role: string;
  tenantSlug: string;
}

export interface StoredTenant {
  slug: string;
  nombre: string;
  plan: string;
}

const TOKEN_KEY = 'access_token';
const USER_KEY = 'user';
const TENANT_KEY = 'tenant';
const COOKIE_NAME = 'sgr-token';

/**
 * Checks if we're running in a browser environment (not SSR).
 */
function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

/**
 * Sets a cookie with the given name and value.
 * The cookie is set with path=/ so it's available to Next.js middleware.
 */
function setCookie(name: string, value: string): void {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; SameSite=Lax`;
}

/**
 * Removes a cookie by setting its expiry in the past.
 */
function removeCookie(name: string): void {
  document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
}

/**
 * Stores authentication data after a successful login.
 * - Saves the access token in localStorage and as an HTTP cookie (`sgr-token`)
 * - Saves user and tenant data in localStorage
 */
export function setAuthData(
  accessToken: string,
  user: StoredUser,
  tenant: StoredTenant
): void {
  if (!isBrowser()) return;

  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  localStorage.setItem(TENANT_KEY, JSON.stringify(tenant));
  setCookie(COOKIE_NAME, accessToken);
}

/**
 * Reads the access token from localStorage.
 * Returns null if not in a browser or no token is stored.
 */
export function getAccessToken(): string | null {
  if (!isBrowser()) return null;
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * Reads the stored user data from localStorage.
 * Returns null if not in a browser, no user is stored, or data is invalid.
 */
export function getStoredUser(): StoredUser | null {
  if (!isBrowser()) return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
}

/**
 * Reads the stored tenant data from localStorage.
 * Returns null if not in a browser, no tenant is stored, or data is invalid.
 */
export function getStoredTenant(): StoredTenant | null {
  if (!isBrowser()) return null;
  const raw = localStorage.getItem(TENANT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredTenant;
  } catch {
    return null;
  }
}

/**
 * Removes all authentication data from localStorage and the cookie.
 */
export function clearAuthData(): void {
  if (!isBrowser()) return;

  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(TENANT_KEY);
  localStorage.removeItem('refresh_token');
  removeCookie(COOKIE_NAME);
}
