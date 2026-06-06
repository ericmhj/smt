import type { FastifyInstance } from 'fastify';
import { FormService } from './form.service.js';
import { FormError } from './form.errors.js';
import { requireRole } from '../users/rbac.middleware.js';
import { createFormSchema, updateFormSchema, formFiltersSchema } from './form.schemas.js';
import type { Database } from '../../db/index.js';

export async function formRoutes(
  fastify: FastifyInstance,
  opts: { db: Database },
): Promise<void> {
  const formService = new FormService(opts.db);

  const adminRoles = requireRole(['superusuario', 'admin']);
  const readRoles = requireRole(['superusuario', 'admin', 'manager', 'tecnico', 'asistente']);

  // POST /api/forms — create form from HTML
  fastify.post(
    '/api/forms',
    { preHandler: [adminRoles] },
    async (request, reply) => {
      const parseResult = createFormSchema.safeParse(request.body);

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
        const result = await formService.create(
          parseResult.data.html,
          { name: parseResult.data.name },
          request.user,
        );
        return reply.status(201).send(result);
      } catch (error) {
        if (error instanceof FormError) {
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

  // PUT /api/forms/:id — update form
  fastify.put(
    '/api/forms/:id',
    { preHandler: [adminRoles] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parseResult = updateFormSchema.safeParse(request.body);

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
        const result = await formService.update(
          id,
          parseResult.data.html,
          request.user,
          parseResult.data.newName,
        );
        return reply.status(200).send(result);
      } catch (error) {
        if (error instanceof FormError) {
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

  // PATCH /api/forms/:id/activate — activate form
  fastify.patch(
    '/api/forms/:id/activate',
    { preHandler: [adminRoles] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        await formService.activate(id, request.user);
        return reply.status(200).send({
          message: 'Formulario activado exitosamente',
        });
      } catch (error) {
        if (error instanceof FormError) {
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

  // PATCH /api/forms/:id/deactivate — deactivate form
  fastify.patch(
    '/api/forms/:id/deactivate',
    { preHandler: [adminRoles] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        await formService.deactivate(id, request.user);
        return reply.status(200).send({
          message: 'Formulario desactivado exitosamente',
        });
      } catch (error) {
        if (error instanceof FormError) {
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

  // GET /api/forms — list forms
  fastify.get(
    '/api/forms',
    { preHandler: [readRoles] },
    async (request, reply) => {
      const parseResult = formFiltersSchema.safeParse(request.query);

      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          message: 'Parámetros de consulta inválidos',
          details: parseResult.error.flatten().fieldErrors,
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      try {
        // Manager only sees active forms
        const filters = { ...parseResult.data };
        const userRole = request.user.role;
        if (userRole === 'manager') {
          filters.isActive = true;
        }

        const result = await formService.findAll(filters);
        return reply.status(200).send(result);
      } catch (error) {
        if (error instanceof FormError) {
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

  // GET /api/forms/:id — form detail
  fastify.get(
    '/api/forms/:id',
    { preHandler: [readRoles] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        const form = await formService.findById(id);
        return reply.status(200).send(form);
      } catch (error) {
        if (error instanceof FormError) {
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

  // GET /api/forms/:id/versions — version history
  fastify.get(
    '/api/forms/:id/versions',
    { preHandler: [adminRoles] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        const versions = await formService.getVersionHistory(id);
        return reply.status(200).send(versions);
      } catch (error) {
        if (error instanceof FormError) {
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

  // GET /api/forms/:id/schema — JSON schema of current version
  fastify.get(
    '/api/forms/:id/schema',
    { preHandler: [readRoles] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        const schema = await formService.getSchema(id);
        return reply.status(200).send(schema);
      } catch (error) {
        if (error instanceof FormError) {
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

  // DELETE /api/forms/:id — delete form (superusuario only)
  const superOnly = requireRole(['superusuario']);
  fastify.delete(
    '/api/forms/:id',
    { preHandler: [superOnly] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        await formService.delete(id, request.user);
        return reply.status(200).send({ message: 'Formulario eliminado exitosamente' });
      } catch (error) {
        if (error instanceof FormError) {
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
