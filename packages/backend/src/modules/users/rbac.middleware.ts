import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Role } from './user.types.js';

/**
 * Creates a Fastify preHandler hook that checks if the authenticated user
 * has one of the allowed roles.
 */
export function requireRole(roles: Role[]) {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
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

    const userRole = user.role as Role;

    if (!roles.includes(userRole)) {
      // Log unauthorized access attempt (audit module comes later)
      request.log.warn(
        { userId: user.sub, role: userRole, requiredRoles: roles, url: request.url },
        'Intento de acceso no autorizado',
      );

      return reply.status(403).send({
        statusCode: 403,
        code: 'AUTH_005',
        message: 'No tienes permisos para acceder a este recurso',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }
  };
}
