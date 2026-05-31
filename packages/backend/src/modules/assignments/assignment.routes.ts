import type { FastifyInstance } from 'fastify';
import { AssignmentService } from './assignment.service.js';
import { AssignmentError } from './assignment.errors.js';
import { requireRole } from '../users/rbac.middleware.js';
import { assignFormSchema, assignmentIdParamSchema } from './assignment.schemas.js';
import type { Database } from '../../db/index.js';

export async function assignmentRoutes(
  fastify: FastifyInstance,
  opts: { db: Database },
): Promise<void> {
  const assignmentService = new AssignmentService(opts.db);

  const managerRoles = requireRole(['superusuario', 'admin', 'manager']);
  const tecnicoRole = requireRole(['tecnico']);

  // POST /api/assignments — assign form to technician
  fastify.post(
    '/api/assignments',
    { preHandler: [managerRoles] },
    async (request, reply) => {
      const parseResult = assignFormSchema.safeParse(request.body);

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
        const assignment = await assignmentService.assign(
          parseResult.data.formId,
          parseResult.data.tecnicoId,
          request.user,
        );
        return reply.status(201).send(assignment);
      } catch (error) {
        if (error instanceof AssignmentError) {
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

  // DELETE /api/assignments/:id — revoke assignment
  fastify.delete(
    '/api/assignments/:id',
    { preHandler: [managerRoles] },
    async (request, reply) => {
      const paramResult = assignmentIdParamSchema.safeParse(request.params);

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
        await assignmentService.revoke(paramResult.data.id, request.user);
        return reply.status(200).send({
          message: 'Asignación revocada exitosamente',
        });
      } catch (error) {
        if (error instanceof AssignmentError) {
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

  // GET /api/assignments/tecnico/:id — forms assigned to a technician
  fastify.get(
    '/api/assignments/tecnico/:id',
    { preHandler: [managerRoles] },
    async (request, reply) => {
      const paramResult = assignmentIdParamSchema.safeParse(request.params);

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
        const assignments = await assignmentService.getByTecnico(paramResult.data.id);
        return reply.status(200).send(assignments);
      } catch (error) {
        if (error instanceof AssignmentError) {
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

  // GET /api/assignments/form/:id — technicians assigned to a form
  fastify.get(
    '/api/assignments/form/:id',
    { preHandler: [managerRoles] },
    async (request, reply) => {
      const paramResult = assignmentIdParamSchema.safeParse(request.params);

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
        const assignments = await assignmentService.getByForm(paramResult.data.id);
        return reply.status(200).send(assignments);
      } catch (error) {
        if (error instanceof AssignmentError) {
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

  // GET /api/my-forms — forms of authenticated technician
  fastify.get(
    '/api/my-forms',
    { preHandler: [tecnicoRole] },
    async (request, reply) => {
      try {
        const myForms = await assignmentService.getMyForms(request.user.sub);
        return reply.status(200).send(myForms);
      } catch (error) {
        if (error instanceof AssignmentError) {
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
