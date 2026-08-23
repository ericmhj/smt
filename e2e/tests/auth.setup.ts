import { test as setup } from '@playwright/test';
import path from 'path';

const authFile = path.join(__dirname, '.auth', 'session.json');

setup('login as manager via API and save session', async ({ page }) => {
  const baseUrl = process.env.BASE_URL || 'http://sgr-frontend:3000';
  const apiUrl = process.env.API_URL || 'http://sgr-backend:3001';
  const email = process.env.MANAGER_EMAIL || 'robles@el-reloj.com';
  const password = process.env.MANAGER_PASSWORD || 'manager123';
  const tenantSlug = process.env.TENANT_SLUG || 'el-reloj';

  // Set tenant cookie so frontend resolves the correct tenant without subdomain
  await page.context().addCookies([{
    name: 'sgr-tenant',
    value: tenantSlug,
    domain: new URL(baseUrl).hostname,
    path: '/',
  }]);

  // Navigate to any page first to set the origin for localStorage
  await page.goto(`${baseUrl}/login`);

  // Login via API with tenant slug header
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
    { apiUrl, email, password, tenantSlug }
  );

  if ('error' in loginResult) {
    throw new Error(`API login failed: ${loginResult.error}`);
  }

  // Store tokens in localStorage (same as frontend does)
  await page.evaluate(
    ({ accessToken, refreshToken, user }) => {
      localStorage.setItem('access_token', accessToken);
      if (refreshToken) localStorage.setItem('refresh_token', refreshToken);
      if (user) localStorage.setItem('user', JSON.stringify(user));
      // Set sgr-token cookie (Next.js middleware reads this for auth)
      document.cookie = `sgr-token=${encodeURIComponent(accessToken)}; path=/; SameSite=Lax`;
    },
    {
      accessToken: loginResult.accessToken,
      refreshToken: loginResult.refreshToken,
      user: loginResult.user,
    }
  );

  // Save storage state (cookies + localStorage)
  await page.context().storageState({ path: authFile });
});
