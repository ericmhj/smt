import type { FastifyInstance } from 'fastify';
import { TicketService } from './ticket.service.js';
import { SLAService } from './sla.service.js';
import { AsignacionService } from './asignacion.service.js';
import { TicketError } from './ticket.errors.js';
import { requireClientePermission } from '../clientes/rbac.guard.js';
import {
  createTicketSchema,
  ticketTransitionSchema,
  ticketFiltersSchema,
  ticketIdParamSchema,
  tecnicoBodySchema,
  reactivoBodySchema,
  updateSLAConfigSchema,
  prioridadParamSchema,
  createReglaAsignacionSchema,
  updateReglaAsignacionSchema,
  reglaIdParamSchema,
} from './ticket.schemas.js';
import { enqueueAssignment } from './queues.js';
import type { Database } from '../../db/index.js';

export async function ticketRoutes(
  fastify: FastifyInstance,
  opts: { db: Database },
): Promise<void> {
  const ticketService = new TicketService(opts.db);
  const slaService = new SLAService(opts.db);
  const asignacionService = new AsignacionService(opts.db);

  // ─── Tickets CRUD ─────────────────────────────────────────────────────────

  // POST /api/tickets
  fastify.post(
    '/api/tickets',
    { preHandler: [requireClientePermission('tickets:write')] },
    async (request, reply) => {
      const bodyResult = createTicketSchema.safeParse(request.body);
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
        const ticket = await ticketService.create(bodyResult.data, request.user);

        // If no tecnico assigned, enqueue for async auto-assignment
        if (!bodyResult.data.tecnicoAsignadoId) {
          try {
            await enqueueAssignment(ticket.id, ticket.clienteId);
          } catch {
            // Queue enqueue failure is non-critical; assignment can happen later
          }
        }

        return reply.status(201).send(ticket);
      } catch (error) {
        if (error instanceof TicketError) {
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

  // GET /api/tickets
  fastify.get(
    '/api/tickets',
    { preHandler: [requireClientePermission('tickets:read')] },
    async (request, reply) => {
      const queryResult = ticketFiltersSchema.safeParse(request.query);
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

      const { page, pageSize, fechaDesde, fechaHasta, ...rest } = queryResult.data;
      const filters = {
        ...rest,
        fechaDesde: fechaDesde ? new Date(fechaDesde) : undefined,
        fechaHasta: fechaHasta ? new Date(fechaHasta) : undefined,
      };

      const result = await ticketService.list(filters, { page, pageSize });
      return reply.status(200).send(result);
    },
  );

  // GET /api/tickets/filters — distinct values for dropdown population
  fastify.get(
    '/api/tickets/filters',
    { preHandler: [requireClientePermission('tickets:read')] },
    async (request, reply) => {
      const filters = await ticketService.getFilterOptions();
      return reply.status(200).send(filters);
    },
  );

  // GET /api/tickets/:id
  fastify.get(
    '/api/tickets/:id',
    { preHandler: [requireClientePermission('tickets:read')] },
    async (request, reply) => {
      const paramResult = ticketIdParamSchema.safeParse(request.params);
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

      const ticket = await ticketService.getById(paramResult.data.id);
      if (!ticket) {
        return reply.status(404).send({
          statusCode: 404,
          code: 'TICKET_NOT_FOUND',
          message: 'Ticket no encontrado',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      return reply.status(200).send(ticket);
    },
  );

  // PATCH /api/tickets/:id/estado
  fastify.patch(
    '/api/tickets/:id/estado',
    { preHandler: [requireClientePermission('tickets:write')] },
    async (request, reply) => {
      const paramResult = ticketIdParamSchema.safeParse(request.params);
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

      const bodyResult = ticketTransitionSchema.safeParse(request.body);
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
        const ticket = await ticketService.transition(
          paramResult.data.id,
          bodyResult.data.estado,
          request.user,
        );
        return reply.status(200).send(ticket);
      } catch (error) {
        if (error instanceof TicketError) {
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

  // PATCH /api/tickets/:id/tecnico
  fastify.patch(
    '/api/tickets/:id/tecnico',
    { preHandler: [requireClientePermission('tickets:assign')] },
    async (request, reply) => {
      const paramResult = ticketIdParamSchema.safeParse(request.params);
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

      const bodyResult = tecnicoBodySchema.safeParse(request.body);
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
        const ticket = await ticketService.reassignTecnico(
          paramResult.data.id,
          bodyResult.data.tecnicoId,
          request.user,
        );
        return reply.status(200).send(ticket);
      } catch (error) {
        if (error instanceof TicketError) {
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

  // PATCH /api/tickets/:id/reactivo
  fastify.patch(
    '/api/tickets/:id/reactivo',
    { preHandler: [requireClientePermission('tickets:write')] },
    async (request, reply) => {
      const paramResult = ticketIdParamSchema.safeParse(request.params);
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

      const bodyResult = reactivoBodySchema.safeParse(request.body);
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
        const ticket = await ticketService.linkReactivo(
          paramResult.data.id,
          bodyResult.data.reactivoId,
        );
        return reply.status(200).send(ticket);
      } catch (error) {
        if (error instanceof TicketError) {
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

  // ─── SLA Config ───────────────────────────────────────────────────────────

  // GET /api/config/sla
  fastify.get(
    '/api/config/sla',
    { preHandler: [requireClientePermission('config:sla')] },
    async (_request, reply) => {
      const config = await slaService.getConfig();
      return reply.status(200).send(config);
    },
  );

  // PUT /api/config/sla/:prioridad
  fastify.put(
    '/api/config/sla/:prioridad',
    { preHandler: [requireClientePermission('config:sla')] },
    async (request, reply) => {
      const paramResult = prioridadParamSchema.safeParse(request.params);
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

      const bodyResult = updateSLAConfigSchema.safeParse(request.body);
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

      const config = await slaService.updateConfig(
        paramResult.data.prioridad,
        bodyResult.data.horasLimite,
        request.user,
      );
      return reply.status(200).send(config);
    },
  );

  // ─── Reglas de Asignación ─────────────────────────────────────────────────

  // GET /api/config/reglas-asignacion
  fastify.get(
    '/api/config/reglas-asignacion',
    { preHandler: [requireClientePermission('config:assignment_rules')] },
    async (_request, reply) => {
      const rules = await asignacionService.getRules();
      return reply.status(200).send(rules);
    },
  );

  // POST /api/config/reglas-asignacion
  fastify.post(
    '/api/config/reglas-asignacion',
    { preHandler: [requireClientePermission('config:assignment_rules')] },
    async (request, reply) => {
      const bodyResult = createReglaAsignacionSchema.safeParse(request.body);
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

      const rule = await asignacionService.createRule(bodyResult.data, request.user);
      return reply.status(201).send(rule);
    },
  );

  // PUT /api/config/reglas-asignacion/:id
  fastify.put(
    '/api/config/reglas-asignacion/:id',
    { preHandler: [requireClientePermission('config:assignment_rules')] },
    async (request, reply) => {
      const paramResult = reglaIdParamSchema.safeParse(request.params);
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

      const bodyResult = updateReglaAsignacionSchema.safeParse(request.body);
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
        const rule = await asignacionService.updateRule(
          paramResult.data.id,
          bodyResult.data,
          request.user,
        );
        return reply.status(200).send(rule);
      } catch (error) {
        if (error instanceof Error && error.message.includes('no encontrada')) {
          return reply.status(404).send({
            statusCode: 404,
            code: 'RULE_NOT_FOUND',
            message: error.message,
            timestamp: new Date().toISOString(),
            requestId: request.id,
          });
        }
        throw error;
      }
    },
  );

  // DELETE /api/config/reglas-asignacion/:id
  fastify.delete(
    '/api/config/reglas-asignacion/:id',
    { preHandler: [requireClientePermission('config:assignment_rules')] },
    async (request, reply) => {
      const paramResult = reglaIdParamSchema.safeParse(request.params);
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
        await asignacionService.deleteRule(paramResult.data.id, request.user);
        return reply.status(204).send();
      } catch (error) {
        if (error instanceof Error && error.message.includes('no encontrada')) {
          return reply.status(404).send({
            statusCode: 404,
            code: 'RULE_NOT_FOUND',
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
