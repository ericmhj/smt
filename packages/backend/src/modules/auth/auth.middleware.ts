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

    // Fallback: form session cookie (for rendered forms that use HttpOnly cookie auth)
    if (!authHeader) {
      const { extractFormSessionFromCookie, verifyFormSessionToken } = await import('../../lib/form-session.js');
      const cookieToken = extractFormSessionFromCookie(request.headers.cookie);

      if (cookieToken) {
        const session = await verifyFormSessionToken(cookieToken);
        if (session) {
          // Populate request.user with limited claims from form session
          request.user = {
            sub: session.sub,
            role: 'tecnico',
            tenantId: '',
            tenantSlug: session.tenantSlug,
            iat: 0,
            exp: 0,
            jti: 'form-session',
            formSessionScope: session.formId, // Restrict access to specific form
          };
          return;
        }
      }

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
