import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { DocumentoService } from './documento.service.js';
import { DocumentoError } from './documento.errors.js';
import { ClienteError } from './cliente.errors.js';
import { requireClientePermission } from './rbac.guard.js';
import { clienteIdParamSchema } from './cliente.schemas.js';
import { z } from 'zod';
import type { Database } from '../../db/index.js';

const docIdParamSchema = z.object({
  id: z.string().uuid('id debe ser un UUID válido'),
  docId: z.string().uuid('docId debe ser un UUID válido'),
});

export async function documentoRoutes(
  fastify: FastifyInstance,
  opts: { db: Database },
): Promise<void> {
  const documentoService = new DocumentoService(opts.db);

  // Register multipart support
  await fastify.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10 MB
    },
  });

  // POST /api/clientes/:id/documentos (multipart upload)
  fastify.post(
    '/api/clientes/:id/documentos',
    { preHandler: [requireClientePermission('clientes:documents')] },
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

      const file = await request.file();
      if (!file) {
        return reply.status(400).send({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          message: 'Se requiere un archivo',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      const buffer = await file.toBuffer();
      const uploadedFile = {
        originalName: file.filename,
        buffer,
        mimeType: file.mimetype,
        size: buffer.length,
      };

      try {
        const documento = await documentoService.upload(
          paramResult.data.id,
          uploadedFile,
          request.user,
        );
        return reply.status(201).send(documento);
      } catch (error) {
        if (error instanceof DocumentoError) {
          return reply.status(error.statusCode).send({
            statusCode: error.statusCode,
            code: error.code,
            message: error.message,
            timestamp: new Date().toISOString(),
            requestId: request.id,
          });
        }
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

  // GET /api/clientes/:id/documentos
  fastify.get(
    '/api/clientes/:id/documentos',
    { preHandler: [requireClientePermission('clientes:documents')] },
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
        const documentos = await documentoService.list(paramResult.data.id);
        return reply.status(200).send(documentos);
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

  // GET /api/clientes/:id/documentos/:docId/download
  fastify.get(
    '/api/clientes/:id/documentos/:docId/download',
    { preHandler: [requireClientePermission('clientes:documents')] },
    async (request, reply) => {
      const paramResult = docIdParamSchema.safeParse(request.params);
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
        const url = await documentoService.getDownloadUrl(paramResult.data.docId);
        return reply.status(200).send({ url });
      } catch (error) {
        if (error instanceof DocumentoError) {
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

  // DELETE /api/clientes/:id/documentos/:docId
  fastify.delete(
    '/api/clientes/:id/documentos/:docId',
    { preHandler: [requireClientePermission('clientes:documents')] },
    async (request, reply) => {
      const paramResult = docIdParamSchema.safeParse(request.params);
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
        await documentoService.delete(paramResult.data.docId, request.user);
        return reply.status(204).send();
      } catch (error) {
        if (error instanceof DocumentoError) {
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
