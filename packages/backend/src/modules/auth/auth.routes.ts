import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AuthStrategy } from './auth-strategy.factory.js';
import { loginSchema, refreshSchema } from './auth.schemas.js';
import type { AuthService } from './auth.service.js';
import { AuthError } from './auth.service.js';
import { resolveTenantSlug } from './tenant-resolver.js';

export async function authRoutes(
  fastify: FastifyInstance,
  opts: { authService: AuthService; authStrategy: AuthStrategy },
): Promise<void> {
  const { authService, authStrategy } = opts;

  async function handleLogin(request: FastifyRequest, reply: FastifyReply) {
    if (!authStrategy.isLoginEnabled()) {
      return reply.status(410).send({
        statusCode: 410,
        code: 'AUTH_ENDPOINT_DISABLED',
        message: 'Este endpoint está deshabilitado en modo integrado. Utilice Keycloak para autenticación.',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }

    const parseResult = loginSchema.safeParse(request.body);

    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Datos de entrada inválidos',
        details: parseResult.error.flatten().fieldErrors,
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }

    try {
      const tenantSlug = resolveTenantSlug(request);

      // Integrated mode: delegate to strategy's cascade login
      if (authStrategy.login) {
        const result = await authStrategy.login(parseResult.data, tenantSlug);
        return reply.status(200).send({
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          user: result.user,
          tenant: result.tenant,
        });
      }

      // Standalone mode: delegate to authService
      const tokenPair = await authService.login(parseResult.data, tenantSlug);
      return reply.status(200).send({
        accessToken: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
        user: tokenPair.user,
      });
    } catch (error) {
      if (error instanceof AuthError) {
        return reply.status(error.statusCode).send({
          statusCode: error.statusCode,
          code: error.code,
          message: error.message,
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }
      throw error;
    }
  }

  // POST /api/auth/login
  fastify.post('/api/auth/login', handleLogin);
  fastify.post('/api/v1/auth/login', handleLogin);

  async function handleRefresh(request: FastifyRequest, reply: FastifyReply) {
    if (!authStrategy.isLoginEnabled()) {
      return reply.status(410).send({
        statusCode: 410,
        code: 'AUTH_ENDPOINT_DISABLED',
        message: 'Este endpoint está deshabilitado en modo integrado. Utilice Keycloak para autenticación.',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }

    const parseResult = refreshSchema.safeParse(request.body);

    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Datos de entrada inválidos',
        details: parseResult.error.flatten().fieldErrors,
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }

    try {
      // Integrated mode: delegate refresh to Keycloak via strategy
      if (authStrategy.refreshToken) {
        const result = await authStrategy.refreshToken(parseResult.data.refreshToken);
        return reply.status(200).send({
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        });
      }

      // Standalone mode: delegate to authService
      const tokenPair = await authService.refresh(parseResult.data.refreshToken);
      return reply.status(200).send({
        accessToken: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
      });
    } catch (error) {
      if (error instanceof AuthError) {
        return reply.status(error.statusCode).send({
          statusCode: error.statusCode,
          code: error.code,
          message: error.message,
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }
      throw error;
    }
  }

  fastify.post('/api/auth/refresh', handleRefresh);
  fastify.post('/api/v1/auth/refresh', handleRefresh);

  async function handleLogout(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user;

    if (!user) {
      return reply.status(401).send({
        statusCode: 401,
        code: 'AUTH_003',
        message: 'Autenticación requerida',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }

    try {
      await authService.logout(user.sub, user.jti, user.tenantSlug);
      return reply.status(200).send({
        message: 'Sesión cerrada exitosamente',
      });
    } catch (error) {
      if (error instanceof AuthError) {
        return reply.status(error.statusCode).send({
          statusCode: error.statusCode,
          code: error.code,
          message: error.message,
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }
      throw error;
    }
  }

  fastify.post('/api/auth/logout', handleLogout);
  fastify.post('/api/v1/auth/logout', handleLogout);
}
