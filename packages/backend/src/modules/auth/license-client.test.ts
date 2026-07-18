import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LicenseClient, type LicenseClientConfig } from './license-client.js';
import { AuthError } from './auth.service.js';

const defaultConfig: LicenseClientConfig = {
  baseUrl: 'http://license-service:3000',
  timeoutMs: 5000,
  circuitBreaker: {
    failureThreshold: 3,
    resetTimeoutMs: 60000,
  },
};

describe('LicenseClient', () => {
  let client: LicenseClient;

  beforeEach(() => {
    client = new LicenseClient(defaultConfig);
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('checkAccess', () => {
    it('returns active license status on success', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'active' }), { status: 200 }),
      );

      const result = await client.checkAccess('acme');

      expect(result).toEqual({ status: 'active', tenantSlug: 'acme' });
      expect(fetch).toHaveBeenCalledWith(
        'http://license-service:3000/access/acme',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('throws LICENSE_SUSPENDED (403) when status is suspended', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'suspended' }), { status: 200 }),
      );

      await expect(client.checkAccess('acme')).rejects.toMatchObject({
        statusCode: 403,
        code: 'LICENSE_SUSPENDED',
        message: 'Servicio suspendido. Contacte a su proveedor.',
      });
    });

    it('throws LICENSE_EXPIRED (403) when status is expired', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'expired' }), { status: 200 }),
      );

      await expect(client.checkAccess('acme')).rejects.toMatchObject({
        statusCode: 403,
        code: 'LICENSE_EXPIRED',
        message: 'Licencia expirada. Contacte a su proveedor.',
      });
    });

    it('throws LICENSE_SERVICE_UNAVAILABLE (503) on 5xx response', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response('Internal Server Error', { status: 500 }),
      );

      await expect(client.checkAccess('acme')).rejects.toMatchObject({
        statusCode: 503,
        code: 'LICENSE_SERVICE_UNAVAILABLE',
        message: 'Servicio de licencias no disponible',
      });
    });

    it('throws LICENSE_SERVICE_UNAVAILABLE (503) on network error', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('ECONNREFUSED'));

      await expect(client.checkAccess('acme')).rejects.toMatchObject({
        statusCode: 503,
        code: 'LICENSE_SERVICE_UNAVAILABLE',
        message: 'Servicio de licencias no disponible',
      });
    });

    it('encodes tenant slug in URL', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'active' }), { status: 200 }),
      );

      await client.checkAccess('my tenant');

      expect(fetch).toHaveBeenCalledWith(
        'http://license-service:3000/access/my%20tenant',
        expect.any(Object),
      );
    });
  });
});
