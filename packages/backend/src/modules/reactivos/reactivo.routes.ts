import type { FastifyInstance } from 'fastify';
import { ReactivoService } from './reactivo.service.js';
import { PDFService } from './pdf.service.js';
import { ReactivoError } from './reactivo.errors.js';
import { requireRole } from '../users/rbac.middleware.js';
import {
  createReactivoSchema,
  reapplyReactivoSchema,
  reactivoIdParamSchema,
  myReactivosQuerySchema,
} from './reactivo.schemas.js';
import type { Database } from '../../db/index.js';

export async function reactivoRoutes(
  fastify: FastifyInstance,
  opts: { db: Database },
): Promise<void> {
  const reactivoService = new ReactivoService(opts.db);
  const pdfService = new PDFService(opts.db);

  const tecnicoRole = requireRole(['tecnico', 'tecnico_de_campo']);
  const allAuthenticated = requireRole(['superusuario', 'admin', 'manager', 'tecnico', 'tecnico_de_campo']);

  // POST /api/reactivos — create reactivo (requireRole: tecnico)
  fastify.post(
    '/api/reactivos',
    { preHandler: [tecnicoRole] },
    async (request, reply) => {
      const parseResult = createReactivoSchema.safeParse(request.body);

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
        const reactivo = await reactivoService.create(
          parseResult.data.formId,
          parseResult.data.responses,
          request.user,
        );
        return reply.status(201).send(reactivo);
      } catch (error) {
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

  // POST /api/reactivos/:id/reapply — re-apply after rejection (requireRole: tecnico)
  fastify.post(
    '/api/reactivos/:id/reapply',
    { preHandler: [tecnicoRole] },
    async (request, reply) => {
      const paramResult = reactivoIdParamSchema.safeParse(request.params);
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

      const bodyResult = reapplyReactivoSchema.safeParse(request.body);
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
        const reactivo = await reactivoService.reapply(
          paramResult.data.id,
          bodyResult.data.responses,
          request.user,
        );
        return reply.status(201).send(reactivo);
      } catch (error) {
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

  // GET /api/reactivos/:id — reactivo detail (requireRole: all authenticated)
  fastify.get(
    '/api/reactivos/:id',
    { preHandler: [allAuthenticated] },
    async (request, reply) => {
      const paramResult = reactivoIdParamSchema.safeParse(request.params);
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
        const reactivo = await reactivoService.getById(paramResult.data.id);
        return reply.status(200).send(reactivo);
      } catch (error) {
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

  // GET /api/reactivos/:id/pdf — download PDF
  // tecnico can download own, manager/admin/super can download any
  fastify.get(
    '/api/reactivos/:id/pdf',
    { preHandler: [allAuthenticated] },
    async (request, reply) => {
      const paramResult = reactivoIdParamSchema.safeParse(request.params);
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
        // Check access: tecnico can only download their own
        if (request.user.role === 'tecnico') {
          const reactivo = await reactivoService.getById(paramResult.data.id);
          if (reactivo.tecnicoId !== request.user.sub) {
            return reply.status(403).send({
              statusCode: 403,
              code: 'AUTH_005',
              message: 'No tienes permisos para descargar este PDF',
              timestamp: new Date().toISOString(),
              requestId: request.id,
            });
          }
        }

        const pdfBuffer = await pdfService.generate(paramResult.data.id);

        return reply
          .header('Content-Type', 'application/pdf')
          .header(
            'Content-Disposition',
            `attachment; filename="reactivo-${paramResult.data.id}.pdf"`,
          )
          .send(pdfBuffer);
      } catch (error) {
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

  // GET /api/reactivos/:id/chain — attempt chain (requireRole: all authenticated)
  fastify.get(
    '/api/reactivos/:id/chain',
    { preHandler: [allAuthenticated] },
    async (request, reply) => {
      const paramResult = reactivoIdParamSchema.safeParse(request.params);
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
        const chain = await reactivoService.getAttemptChain(paramResult.data.id);
        return reply.status(200).send(chain);
      } catch (error) {
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

  // GET /api/my-reactivos — technician's reactivos (requireRole: tecnico)
  fastify.get(
    '/api/my-reactivos',
    { preHandler: [tecnicoRole] },
    async (request, reply) => {
      const queryResult = myReactivosQuerySchema.safeParse(request.query);
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
        const result = await reactivoService.getByTecnico(request.user.sub, {
          page: queryResult.data.page,
          pageSize: queryResult.data.pageSize,
          state: queryResult.data.state,
        });
        return reply.status(200).send(result);
      } catch (error) {
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
