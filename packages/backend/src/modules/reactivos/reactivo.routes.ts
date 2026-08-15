import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { ReactivoService } from './reactivo.service.js';
import { PDFService } from './pdf.service.js';
import { ReactivoError } from './reactivo.errors.js';
import { requireRole } from '../users/rbac.middleware.js';
import {
  createReactivoSchema,
  reapplyReactivoSchema,
  submitReactivoSchema,
  reactivoIdParamSchema,
  myReactivosQuerySchema,
} from './reactivo.schemas.js';
import type { Database } from '../../db/index.js';
import { reactivos } from '../../db/schema/reactivos.js';

export async function reactivoRoutes(
  fastify: FastifyInstance,
  opts: { db: Database },
): Promise<void> {
  const reactivoService = new ReactivoService(opts.db);
  const pdfService = new PDFService(opts.db);

  const tecnicoRole = requireRole(['tecnico']);
  const allAuthenticated = requireRole(['superusuario', 'admin', 'manager', 'tecnico', 'asistente']);

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

  // POST /api/reactivos/:id/submit — submit ensayo form (requireRole: tecnico)
  fastify.post(
    '/api/reactivos/:id/submit',
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

      const bodyResult = submitReactivoSchema.safeParse(request.body);
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
        const reactivo = await reactivoService.submit(
          paramResult.data.id,
          bodyResult.data.responses,
          request.user,
        );
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

  // POST /api/reactivos/:id/draft — save draft (auto-save partial responses)
  fastify.post(
    '/api/reactivos/:id/draft',
    { preHandler: [tecnicoRole] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { responses } = request.body as { responses: Record<string, unknown> };

      try {
        // Only save draft if reactivo is in 'pendiente' state
        const [reactivo] = await opts.db
          .select({ state: reactivos.state, tecnicoId: reactivos.tecnicoId })
          .from(reactivos)
          .where(eq(reactivos.id, id))
          .limit(1);

        if (!reactivo) {
          return reply.status(404).send({ message: 'Reactivo no encontrado' });
        }
        if (reactivo.tecnicoId !== request.user.sub) {
          return reply.status(403).send({ message: 'No autorizado' });
        }
        if (reactivo.state !== 'pendiente') {
          return reply.status(400).send({ message: 'Solo se puede guardar borrador en estado pendiente' });
        }

        // Update responses without changing state
        await opts.db
          .update(reactivos)
          .set({ responses, updatedAt: new Date() })
          .where(eq(reactivos.id, id));

        return reply.status(200).send({ message: 'Borrador guardado' });
      } catch (error) {
        return reply.status(500).send({ message: 'Error al guardar borrador' });
      }
    },
  );

  // GET /api/reactivos/:id/form — get form HTML and schema for a reactivo (requireRole: tecnico)
  fastify.get(
    '/api/reactivos/:id/form',
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

      try {
        const formData = await reactivoService.getFormData(paramResult.data.id);
        return reply.status(200).send(formData);
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

        const tenantSchema = (request as any).tenantContext?.schemaName;
        const pdfBuffer = await pdfService.generate(paramResult.data.id, tenantSchema);

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
