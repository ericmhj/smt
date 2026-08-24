import type { FastifyInstance } from 'fastify';
import { KanbanService } from './kanban.service.js';
import { KanbanError } from './kanban.errors.js';
import { ReactivoError } from '../reactivos/reactivo.errors.js';
import { requireRole } from '../users/rbac.middleware.js';
import {
  kanbanBoardQuerySchema,
  kanbanTransitionBodySchema,
  kanbanReactivoIdParamSchema,
} from './kanban.schemas.js';
import type { Database } from '../../db/index.js';

export async function kanbanRoutes(
  fastify: FastifyInstance,
  opts: { db: Database },
): Promise<void> {
  const kanbanService = new KanbanService(opts.db);

  const viewRole = requireRole(['superusuario', 'admin', 'manager', 'tecnico']);
  const managerOnly = requireRole(['manager']);

  // GET /api/kanban — get board (requireRole: superusuario, admin, manager, tecnico)
  // tecnico: only sees their own reactivos (filtered by tecnicoId automatically)
  fastify.get(
    '/api/kanban',
    { preHandler: [viewRole] },
    async (request, reply) => {
      const queryResult = kanbanBoardQuerySchema.safeParse(request.query);
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

      try {
        // Tecnico can only see their own reactivos on the board
        const filters = { ...queryResult.data };
        if (request.user.role === 'tecnico') {
          filters.tecnicoId = request.user.sub;
        }

        const board = await kanbanService.getBoard(filters);
        return reply.status(200).send(board);
      } catch (error) {
        if (error instanceof KanbanError) {
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
    },
  );

  // POST /api/kanban/:reactivoId/transition — move card (requireRole: manager ONLY)
  fastify.post(
    '/api/kanban/:reactivoId/transition',
    { preHandler: [managerOnly] },
    async (request, reply) => {
      const paramResult = kanbanReactivoIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          message: 'Parámetro inválido',
          details: paramResult.error.flatten().fieldErrors,
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      const bodyResult = kanbanTransitionBodySchema.safeParse(request.body);
      if (!bodyResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          message: 'Datos de entrada inválidos',
          details: bodyResult.error.flatten().fieldErrors,
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      try {
        const result = await kanbanService.transition(
          paramResult.data.reactivoId,
          bodyResult.data.toState,
          bodyResult.data.signatureId,
          request.user,
          bodyResult.data.reason,
          request.ip,
        );
        return reply.status(200).send(result);
      } catch (error) {
        if (error instanceof KanbanError) {
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
    },
  );

  // GET /api/kanban/:reactivoId/detail — full detail (requireRole: superusuario, admin, manager, tecnico)
  // tecnico can only see detail of their own reactivos
  fastify.get(
    '/api/kanban/:reactivoId/detail',
    { preHandler: [viewRole] },
    async (request, reply) => {
      const paramResult = kanbanReactivoIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          message: 'Parámetro inválido',
          details: paramResult.error.flatten().fieldErrors,
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      try {
        const detail = await kanbanService.getDetail(paramResult.data.reactivoId);

        // Tecnico can only see detail of their own reactivos
        if (request.user.role === 'tecnico' && detail.tecnicoId !== request.user.sub) {
          return reply.status(403).send({
            statusCode: 403,
            code: 'AUTH_005',
            message: 'No tienes permisos para ver este reactivo',
            timestamp: new Date().toISOString(),
            requestId: request.id,
          });
        }

        return reply.status(200).send(detail);
      } catch (error) {
        if (error instanceof KanbanError) {
          return reply.status(error.statusCode).send({
            statusCode: error.statusCode,
            code: error.code,
            message: error.message,
            timestamp: new Date().toISOString(),
            requestId: request.id,
          });
        }
        if (error instanceof ReactivoError) {
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
    },
  );
}
