import type { FastifyInstance } from 'fastify';
import { ClienteService } from './cliente.service.js';
import { BusquedaService } from './busqueda.service.js';
import { ClienteError } from './cliente.errors.js';
import { requireClientePermission } from './rbac.guard.js';
import {
  createClienteSchema,
  updateClienteSchema,
  createContactoSchema,
  updateContactoSchema,
  clienteFiltersSchema,
  searchQuerySchema,
  clienteIdParamSchema,
  contactoIdParamSchema,
  tagParamSchema,
} from './cliente.schemas.js';
import type { Database } from '../../db/index.js';

export async function clienteRoutes(
  fastify: FastifyInstance,
  opts: { db: Database },
): Promise<void> {
  const clienteService = new ClienteService(opts.db);
  const busquedaService = new BusquedaService(opts.db);

  // ─── Clientes CRUD ────────────────────────────────────────────────────────

  // POST /api/clientes
  fastify.post(
    '/api/clientes',
    { preHandler: [requireClientePermission('clientes:write')] },
    async (request, reply) => {
      const bodyResult = createClienteSchema.safeParse(request.body);
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
        const cliente = await clienteService.create(bodyResult.data, request.user);
        return reply.status(201).send(cliente);
      } catch (error) {
        if (error instanceof ClienteError) {
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

  // GET /api/clientes
  fastify.get(
    '/api/clientes',
    { preHandler: [requireClientePermission('clientes:read')] },
    async (request, reply) => {
      const queryResult = clienteFiltersSchema.safeParse(request.query);
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

      const { page, pageSize, etiquetas, ...rest } = queryResult.data;
      const filters = {
        ...rest,
        etiquetas: etiquetas ? etiquetas.split(',').map((t) => t.trim()) : undefined,
        fechaDesde: rest.fechaDesde ? new Date(rest.fechaDesde) : undefined,
        fechaHasta: rest.fechaHasta ? new Date(rest.fechaHasta) : undefined,
      };

      const result = await clienteService.list(filters, { page, pageSize });
      return reply.status(200).send(result);
    },
  );

  // GET /api/clientes/search
  fastify.get(
    '/api/clientes/search',
    { preHandler: [requireClientePermission('clientes:read')] },
    async (request, reply) => {
      const queryResult = searchQuerySchema.safeParse(request.query);
      if (!queryResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          message: 'Parámetros de búsqueda inválidos',
          details: queryResult.error.flatten().fieldErrors,
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      const { q, page, pageSize, etiquetas, ...rest } = queryResult.data;
      const filters = {
        ...rest,
        etiquetas: etiquetas ? etiquetas.split(',').map((t) => t.trim()) : undefined,
        fechaDesde: rest.fechaDesde ? new Date(rest.fechaDesde) : undefined,
        fechaHasta: rest.fechaHasta ? new Date(rest.fechaHasta) : undefined,
      };

      const result = await busquedaService.search(q, filters, { page, pageSize });
      return reply.status(200).send(result);
    },
  );

  // GET /api/clientes/:id
  fastify.get(
    '/api/clientes/:id',
    { preHandler: [requireClientePermission('clientes:read')] },
    async (request, reply) => {
      const paramResult = clienteIdParamSchema.safeParse(request.params);
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
        const cliente = await clienteService.getById(paramResult.data.id);
        if (!cliente) {
          return reply.status(404).send({
            statusCode: 404,
            code: 'CLIENTE_NOT_FOUND',
            message: 'Cliente no encontrado',
            timestamp: new Date().toISOString(),
            requestId: request.id,
          });
        }
        return reply.status(200).send(cliente);
      } catch (error) {
        if (error instanceof ClienteError) {
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

  // PUT /api/clientes/:id
  fastify.put(
    '/api/clientes/:id',
    { preHandler: [requireClientePermission('clientes:write')] },
    async (request, reply) => {
      const paramResult = clienteIdParamSchema.safeParse(request.params);
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

      const bodyResult = updateClienteSchema.safeParse(request.body);
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
        const cliente = await clienteService.update(
          paramResult.data.id,
          bodyResult.data,
          request.user,
        );
        return reply.status(200).send(cliente);
      } catch (error) {
        if (error instanceof ClienteError) {
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

  // DELETE /api/clientes/:id (soft delete / deactivate)
  fastify.delete(
    '/api/clientes/:id',
    { preHandler: [requireClientePermission('clientes:write')] },
    async (request, reply) => {
      const paramResult = clienteIdParamSchema.safeParse(request.params);
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
        await clienteService.deactivate(paramResult.data.id, request.user);
        return reply.status(204).send();
      } catch (error) {
        if (error instanceof ClienteError) {
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

  // ─── Etiquetas ──────────────────────────────────────────────────────────────

  // POST /api/clientes/:id/tags
  fastify.post(
    '/api/clientes/:id/tags',
    { preHandler: [requireClientePermission('clientes:tags')] },
    async (request, reply) => {
      const paramResult = clienteIdParamSchema.safeParse(request.params);
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

      const bodyResult = tagParamSchema.safeParse(request.body);
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
        const tags = await clienteService.addTag(
          paramResult.data.id,
          bodyResult.data.tag,
          request.user,
        );
        return reply.status(200).send({ etiquetas: tags });
      } catch (error) {
        if (error instanceof ClienteError) {
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

  // DELETE /api/clientes/:id/tags/:tag
  fastify.delete(
    '/api/clientes/:id/tags/:tag',
    { preHandler: [requireClientePermission('clientes:tags')] },
    async (request, reply) => {
      const paramResult = clienteIdParamSchema.safeParse(request.params);
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

      const tagResult = tagParamSchema.safeParse(request.params);
      if (!tagResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          message: 'Parámetro inválido',
          details: tagResult.error.flatten().fieldErrors,
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      try {
        const tags = await clienteService.removeTag(
          paramResult.data.id,
          tagResult.data.tag,
          request.user,
        );
        return reply.status(200).send({ etiquetas: tags });
      } catch (error) {
        if (error instanceof ClienteError) {
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

  // ─── Contactos ──────────────────────────────────────────────────────────────

  // POST /api/clientes/:id/contactos
  fastify.post(
    '/api/clientes/:id/contactos',
    { preHandler: [requireClientePermission('clientes:write')] },
    async (request, reply) => {
      const paramResult = clienteIdParamSchema.safeParse(request.params);
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

      const bodyResult = createContactoSchema.safeParse(request.body);
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
        const contacto = await clienteService.addContacto(
          paramResult.data.id,
          bodyResult.data,
          request.user,
        );
        return reply.status(201).send(contacto);
      } catch (error) {
        if (error instanceof ClienteError) {
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

  // GET /api/clientes/:id/contactos
  fastify.get(
    '/api/clientes/:id/contactos',
    { preHandler: [requireClientePermission('clientes:read')] },
    async (request, reply) => {
      const paramResult = clienteIdParamSchema.safeParse(request.params);
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
        const contactos = await clienteService.getContactos(paramResult.data.id);
        return reply.status(200).send(contactos);
      } catch (error) {
        if (error instanceof ClienteError) {
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

  // PUT /api/clientes/:id/contactos/:contactoId
  fastify.put(
    '/api/clientes/:id/contactos/:contactoId',
    { preHandler: [requireClientePermission('clientes:write')] },
    async (request, reply) => {
      const contactoParamResult = contactoIdParamSchema.safeParse(request.params);
      if (!contactoParamResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          message: 'Parámetro inválido',
          details: contactoParamResult.error.flatten().fieldErrors,
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      const bodyResult = updateContactoSchema.safeParse(request.body);
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
        const contacto = await clienteService.updateContacto(
          contactoParamResult.data.contactoId,
          bodyResult.data,
          request.user,
        );
        return reply.status(200).send(contacto);
      } catch (error) {
        if (error instanceof ClienteError) {
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

  // DELETE /api/clientes/:id/contactos/:contactoId
  fastify.delete(
    '/api/clientes/:id/contactos/:contactoId',
    { preHandler: [requireClientePermission('clientes:write')] },
    async (request, reply) => {
      const contactoParamResult = contactoIdParamSchema.safeParse(request.params);
      if (!contactoParamResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          message: 'Parámetro inválido',
          details: contactoParamResult.error.flatten().fieldErrors,
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      try {
        await clienteService.removeContacto(
          contactoParamResult.data.contactoId,
          request.user,
        );
        return reply.status(204).send();
      } catch (error) {
        if (error instanceof ClienteError) {
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
