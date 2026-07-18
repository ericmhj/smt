import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { KeycloakClient, KeycloakErrorCode } from './keycloak-client.js';
import { AuthError } from './auth.service.js';

const TEST_CONFIG = {
  tokenUrl: 'http://keycloak:8080/realms/mikel-crm/protocol/openid-connect/token',
  clientId: 'sgr-client',
  clientSecret: 'test-secret',
};

describe('KeycloakClient', () => {
  let client: KeycloakClient;

  beforeEach(() => {
    client = new KeycloakClient(TEST_CONFIG);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('authenticateUser', () => {
    it('sends a Direct Access Grant request with correct parameters', async () => {
      const mockResponse = {
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        expires_in: 300,
        token_type: 'Bearer',
      };

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 200 }),
      );

      const result = await client.authenticateUser('user@test.com', 'password123');

      expect(fetchSpy).toHaveBeenCalledWith(
        TEST_CONFIG.tokenUrl,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }),
      );

      // Verify body contains correct grant_type and credentials
      const callArgs = fetchSpy.mock.calls[0]!;
      const body = callArgs[1]!.body as string;
      expect(body).toContain('grant_type=password');
      expect(body).toContain(`client_id=${TEST_CONFIG.clientId}`);
      expect(body).toContain(`client_secret=${TEST_CONFIG.clientSecret}`);
      expect(body).toContain('username=user%40test.com');
      expect(body).toContain('password=password123');

      expect(result).toEqual(mockResponse);
    });

    it('throws AUTH_INVALID_CREDENTIALS on 401 response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 }),
      );

      await expect(client.authenticateUser('user@test.com', 'wrong')).rejects.toMatchObject({
        statusCode: 401,
        code: KeycloakErrorCode.AUTH_INVALID_CREDENTIALS,
        message: 'Credenciales inválidas',
      });
    });

    it('throws AUTH_INVALID_CREDENTIALS on 400 response (invalid_grant)', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }),
      );

      await expect(client.authenticateUser('user@test.com', 'wrong')).rejects.toMatchObject({
        statusCode: 401,
        code: KeycloakErrorCode.AUTH_INVALID_CREDENTIALS,
        message: 'Credenciales inválidas',
      });
    });

    it('throws AUTH_SERVICE_UNAVAILABLE on 500 response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('Internal Server Error', { status: 500 }),
      );

      await expect(client.authenticateUser('user@test.com', 'pass')).rejects.toMatchObject({
        statusCode: 503,
        code: KeycloakErrorCode.AUTH_SERVICE_UNAVAILABLE,
        message: 'Servicio de autenticación no disponible',
      });
    });

    it('throws AUTH_SERVICE_UNAVAILABLE on 502 response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('Bad Gateway', { status: 502 }),
      );

      await expect(client.authenticateUser('user@test.com', 'pass')).rejects.toMatchObject({
        statusCode: 503,
        code: KeycloakErrorCode.AUTH_SERVICE_UNAVAILABLE,
        message: 'Servicio de autenticación no disponible',
      });
    });

    it('throws AUTH_SERVICE_UNAVAILABLE on 503 response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('Service Unavailable', { status: 503 }),
      );

      await expect(client.authenticateUser('user@test.com', 'pass')).rejects.toMatchObject({
        statusCode: 503,
        code: KeycloakErrorCode.AUTH_SERVICE_UNAVAILABLE,
        message: 'Servicio de autenticación no disponible',
      });
    });

    it('throws AUTH_SERVICE_UNAVAILABLE on network error', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(client.authenticateUser('user@test.com', 'pass')).rejects.toMatchObject({
        statusCode: 503,
        code: KeycloakErrorCode.AUTH_SERVICE_UNAVAILABLE,
        message: 'Servicio de autenticación no disponible',
      });
    });

    it('throws AUTH_SERVICE_UNAVAILABLE on timeout', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new DOMException('Aborted', 'AbortError'));

      await expect(client.authenticateUser('user@test.com', 'pass')).rejects.toMatchObject({
        statusCode: 503,
        code: KeycloakErrorCode.AUTH_SERVICE_UNAVAILABLE,
        message: 'Servicio de autenticación no disponible',
      });
    });
  });

  describe('extractClaims', () => {
    function createJwt(payload: Record<string, unknown>): string {
      const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
      const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const signature = 'fake-signature';
      return `${header}.${body}.${signature}`;
    }

    it('extracts sub, roles from top-level roles array, and email', () => {
      const token = createJwt({
        sub: 'user-123',
        roles: ['admin', 'tecnico'],
        name: 'Test User',
        email: 'test@example.com',
        tenant_id: 'tenant-abc',
      });

      const claims = client.extractClaims(token);

      expect(claims).toEqual({
        sub: 'user-123',
        roles: ['admin', 'tecnico'],
        name: 'Test User',
        email: 'test@example.com',
        tenantId: 'tenant-abc',
      });
    });

    it('extracts roles from realm_access.roles', () => {
      const token = createJwt({
        sub: 'user-456',
        realm_access: { roles: ['superusuario'] },
        email: 'admin@test.com',
      });

      const claims = client.extractClaims(token);

      expect(claims.sub).toBe('user-456');
      expect(claims.roles).toEqual(['superusuario']);
      expect(claims.email).toBe('admin@test.com');
    });

    it('extracts roles from resource_access', () => {
      const token = createJwt({
        sub: 'user-789',
        resource_access: {
          'sgr-client': { roles: ['manager'] },
          'other-client': { roles: ['viewer'] },
        },
        email: 'manager@test.com',
      });

      const claims = client.extractClaims(token);

      expect(claims.sub).toBe('user-789');
      expect(claims.roles).toEqual(['manager', 'viewer']);
      expect(claims.email).toBe('manager@test.com');
    });

    it('returns empty roles array when no roles are present', () => {
      const token = createJwt({
        sub: 'user-000',
        email: 'noroles@test.com',
      });

      const claims = client.extractClaims(token);

      expect(claims.sub).toBe('user-000');
      expect(claims.roles).toEqual([]);
    });

    it('handles missing optional fields gracefully', () => {
      const token = createJwt({ sub: 'user-minimal' });

      const claims = client.extractClaims(token);

      expect(claims.sub).toBe('user-minimal');
      expect(claims.roles).toEqual([]);
      expect(claims.name).toBeUndefined();
      expect(claims.email).toBeUndefined();
      expect(claims.tenantId).toBeUndefined();
    });

    it('uses preferred_username as name fallback', () => {
      const token = createJwt({
        sub: 'user-pref',
        preferred_username: 'jdoe',
      });

      const claims = client.extractClaims(token);
      expect(claims.name).toBe('jdoe');
    });

    it('reads tenantId from either tenant_id or tenantId claim', () => {
      const token1 = createJwt({ sub: 'u1', tenantId: 'tid-from-camel' });
      const token2 = createJwt({ sub: 'u2', tenant_id: 'tid-from-snake' });

      expect(client.extractClaims(token1).tenantId).toBe('tid-from-camel');
      expect(client.extractClaims(token2).tenantId).toBe('tid-from-snake');
    });

    it('throws on invalid token format', () => {
      expect(() => client.extractClaims('not-a-jwt')).toThrow();
      expect(() => client.extractClaims('only.two')).toThrow();
    });
  });
});
