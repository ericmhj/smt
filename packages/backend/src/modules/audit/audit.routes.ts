import type { FastifyInstance } from 'fastify';
import { AuditService } from './audit.service.js';
import { requireRole } from '../users/rbac.middleware.js';
import { auditQuerySchema, auditEntityParamSchema } from './audit.schemas.js';
import type { Database } from '../../db/index.js';

export async function auditRoutes(
  fastify: FastifyInstance,
  opts: { db: Database },
): Promise<void> {
  const auditService = new AuditService(opts.db);
  const adminRoles = requireRole(['superusuario', 'admin']);

  // GET /api/audit — query audit logs with filters
  fastify.get(
    '/api/audit',
    { preHandler: [adminRoles] },
    async (request, reply) => {
      const queryResult = auditQuerySchema.safeParse(request.query);
      if (!queryResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          message: 'Parámetros de consulta inválidos',
          details: queryResult.error.flatten().fieldErrors,
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      const result = await auditService.query(queryResult.data);
      return reply.status(200).send(result);
    },
  );

  // GET /api/audit/entity/:type/:id — history of a specific entity
  fastify.get(
    '/api/audit/entity/:type/:id',
    { preHandler: [adminRoles] },
    async (request, reply) => {
      const paramResult = auditEntityParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          message: 'Parámetros inválidos',
          details: paramResult.error.flatten().fieldErrors,
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      const history = await auditService.getEntityHistory(
        paramResult.data.type,
        paramResult.data.id,
      );
      return reply.status(200).send(history);
    },
  );
}
