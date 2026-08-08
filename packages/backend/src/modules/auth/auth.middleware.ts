import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import type { AuthStrategy } from './auth-strategy.factory.js';
import { resolveTenantSlug } from './tenant-resolver.js';

const PUBLIC_ROUTES: Array<{ method: string; url: string }> = [
  { method: 'POST', url: '/api/auth/login' },
  { method: 'POST', url: '/api/v1/auth/login' },
  { method: 'POST', url: '/api/auth/refresh' },
  { method: 'POST', url: '/api/v1/auth/refresh' },
  { method: 'GET', url: '/api/health' },
  { method: 'GET', url: '/api/docs' },
  { method: 'GET', url: '/api/form-templates' },
  { method: 'POST', url: '/api/form-templates' },
  { method: 'PUT', url: '/api/form-templates' },
  { method: 'PATCH', url: '/api/form-templates' },
  { method: 'GET', url: '/api/validation-rules' },
  { method: 'POST', url: '/api/validation-rules' },
  { method: 'PUT', url: '/api/validation-rules' },
  { method: 'PATCH', url: '/api/validation-rules' },
  { method: 'DELETE', url: '/api/validation-rules' },
  { method: 'GET', url: '/api/calculation-rules' },
  { method: 'POST', url: '/api/calculation-rules' },
  { method: 'PUT', url: '/api/calculation-rules' },
  { method: 'PATCH', url: '/api/calculation-rules' },
  { method: 'DELETE', url: '/api/calculation-rules' },
];

function isPublicRoute(method: string, url: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => route.method === method && url.startsWith(route.url),
  );
}

async function authMiddlewarePlugin(
  fastify: FastifyInstance,
  opts: { authStrategy: AuthStrategy },
): Promise<void> {
  const { authStrategy } = opts;

  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip auth for public routes
    if (isPublicRoute(request.method, request.url)) {
      return;
    }

    const authHeader = request.headers.authorization;

    if (!authHeader) {
      return reply.status(401).send({
        statusCode: 401,
        code: 'AUTH_003',
        message: 'Token de autenticación requerido',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return reply.status(401).send({
        statusCode: 401,
        code: 'AUTH_003',
        message: 'Formato de token inválido',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }

    const token = parts[1]!;

    try {
      const payload = await authStrategy.verifyToken(token);

      // Enrich tenantSlug from request headers/subdomain when JWT doesn't include it
      // (Keycloak tokens don't carry tenantSlug, so we resolve from X-Tenant-Slug header or subdomain)
      if (!payload.tenantSlug) {
        payload.tenantSlug = resolveTenantSlug(request);
      }

      request.user = payload;
    } catch (error) {
      const authError = error as { statusCode?: number; code?: string; message?: string };
      fastify.log.warn(
        { err: error, url: request.url, reqId: request.id },
        '[AuthMiddleware] Token verification failed',
      );
      return reply.status(authError.statusCode || 401).send({
        statusCode: authError.statusCode || 401,
        code: authError.code || 'AUTH_003',
        message: authError.message || 'Token inválido',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }
  });
}

export const authMiddleware = fp(authMiddlewarePlugin, {
  name: 'auth-middleware',
});
