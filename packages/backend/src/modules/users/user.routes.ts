import type { FastifyInstance } from 'fastify';
import { UserService } from './user.service.js';
import { UserError } from './user.errors.js';
import { requireRole } from './rbac.middleware.js';
import { createUserSchema, updateUserSchema, userFiltersSchema } from './user.schemas.js';
import type { Database } from '../../db/index.js';

export async function userRoutes(
  fastify: FastifyInstance,
  opts: { db: Database },
): Promise<void> {
  const userService = new UserService(opts.db);

  const adminRoles = requireRole(['superusuario', 'admin']);

  // POST /api/users — create user
  fastify.post(
    '/api/users',
    { preHandler: [adminRoles] },
    async (request, reply) => {
      const parseResult = createUserSchema.safeParse(request.body);

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
        const user = await userService.create(parseResult.data, request.user);
        return reply.status(201).send(user);
      } catch (error) {
        if (error instanceof UserError) {
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

  // GET /api/users — list users with filters
  fastify.get(
    '/api/users',
    { preHandler: [adminRoles] },
    async (request, reply) => {
      const parseResult = userFiltersSchema.safeParse(request.query);

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
        const result = await userService.findAll(parseResult.data);
        return reply.status(200).send(result);
      } catch (error) {
        if (error instanceof UserError) {
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

  // GET /api/users/:id — get user by ID
  fastify.get(
    '/api/users/:id',
    { preHandler: [adminRoles] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        const user = await userService.findById(id);
        return reply.status(200).send(user);
      } catch (error) {
        if (error instanceof UserError) {
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

  // PATCH /api/users/:id — update user
  fastify.patch(
    '/api/users/:id',
    { preHandler: [adminRoles] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parseResult = updateUserSchema.safeParse(request.body);

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
        const user = await userService.update(id, parseResult.data, request.user);
        return reply.status(200).send(user);
      } catch (error) {
        if (error instanceof UserError) {
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

  // DELETE /api/users/:id — delete user
  fastify.delete(
    '/api/users/:id',
    { preHandler: [adminRoles] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        await userService.delete(id, request.user);
        return reply.status(204).send();
      } catch (error) {
        if (error instanceof UserError) {
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

  // PATCH /api/users/:id/deactivate — deactivate user
  fastify.patch(
    '/api/users/:id/deactivate',
    { preHandler: [adminRoles] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        await userService.deactivate(id, request.user);
        return reply.status(200).send({
          message: 'Usuario desactivado exitosamente',
        });
      } catch (error) {
        if (error instanceof UserError) {
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
