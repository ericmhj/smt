import type { FastifyRequest, FastifyReply } from 'fastify';

export type ClientePermission =
  | 'clientes:read'
  | 'clientes:write'
  | 'clientes:tags'
  | 'clientes:documents'
  | 'tickets:read'
  | 'tickets:write'
  | 'tickets:assign'
  | 'config:assignment_rules'
  | 'config:sla';

const PERMISSION_MATRIX: Record<string, ClientePermission[]> = {
  manager: [
    'clientes:read', 'clientes:write', 'clientes:tags', 'clientes:documents',
    'tickets:read', 'tickets:write', 'tickets:assign',
    'config:assignment_rules', 'config:sla',
  ],
  asistente: [
    'clientes:read', 'clientes:write', 'clientes:tags', 'clientes:documents',
    'tickets:read', 'tickets:write', 'tickets:assign',
  ],
};

export function hasPermission(role: string, permission: ClientePermission): boolean {
  const perms = PERMISSION_MATRIX[role];
  if (!perms) return false;
  return perms.includes(permission);
}

/**
 * Fastify preHandler hook that checks if the authenticated user has
 * the required permission for the clients module.
 * Returns 403 if access denied.
 */
export function requireClientePermission(permission: ClientePermission) {
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

    if (!hasPermission(user.role, permission)) {
      request.log.warn(
        { userId: user.sub, role: user.role, requiredPermission: permission, url: request.url },
        'Intento de acceso no autorizado al módulo de clientes',
      );

      return reply.status(403).send({
        statusCode: 403,
        code: 'CLIENTE_FORBIDDEN',
        message: 'No tiene permisos para realizar esta operación',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }
  };
}
