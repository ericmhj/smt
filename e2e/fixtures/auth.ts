import { Page } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://sgr-frontend:3000';
const API_URL = process.env.API_URL || 'http://sgr-backend:3001';
const TENANT_SLUG = process.env.TENANT_SLUG || 'el-reloj';

/**
 * Login as a specific user via API (works without subdomain).
 * Sets cookies and localStorage so the frontend recognizes the session.
 */
export async function loginAs(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  // Navigate to set origin
  await page.goto(`${BASE_URL}/login`);

  // Set tenant cookie
  await page.context().addCookies([{
    name: 'sgr-tenant',
    value: TENANT_SLUG,
    domain: new URL(BASE_URL).hostname,
    path: '/',
  }]);

  // Login via API
  const loginResult = await page.evaluate(
    async ({ apiUrl, email, password, tenantSlug }) => {
      const res = await fetch(`${apiUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Slug': tenantSlug,
        },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        return { error: err.message || `Status ${res.status}` };
      }
      return res.json();
    },
    { apiUrl: API_URL, email, password, tenantSlug: TENANT_SLUG }
  );

  if ('error' in loginResult) {
    throw new Error(`loginAs failed for ${email}: ${loginResult.error}`);
  }

  // Store tokens
  await page.evaluate(
    ({ accessToken, refreshToken, user }) => {
      localStorage.setItem('access_token', accessToken);
      if (refreshToken) localStorage.setItem('refresh_token', refreshToken);
      if (user) localStorage.setItem('user', JSON.stringify(user));
      document.cookie = `sgr-token=${encodeURIComponent(accessToken)}; path=/; SameSite=Lax`;
    },
    {
      accessToken: loginResult.accessToken,
      refreshToken: loginResult.refreshToken,
      user: loginResult.user,
    }
  );

  // Navigate away from login
  await page.goto(`${BASE_URL}/kanban`);
}

/**
 * Clear all auth state.
 */
export async function logout(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    document.cookie = 'sgr-token=; path=/; max-age=0';
    document.cookie = 'sgr-tenant=; path=/; max-age=0';
  });
}
