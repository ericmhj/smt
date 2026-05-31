import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { eq } from 'drizzle-orm';
import { ObservationService } from './observation.service.js';
import { ObservationError } from './observation.errors.js';
import { requireRole } from '../users/rbac.middleware.js';
import {
  createObservationBodySchema,
  reactivoIdParamSchema,
  observationIdParamSchema,
  fileIdParamSchema,
} from './observation.schemas.js';
import { observationFiles } from '../../db/schema/observations.js';
import { getFileUrl } from '../../lib/minio.js';
import type { Database } from '../../db/index.js';
import type { FileUploadData } from './observation.types.js';

export async function observationRoutes(
  fastify: FastifyInstance,
  opts: { db: Database },
): Promise<void> {
  // Register multipart plugin for this scope
  await fastify.register(multipart, {
    limits: {
      fileSize: (Number(process.env.MAX_FILE_SIZE_MB) || 10) * 1024 * 1024,
      files: 10, // max 10 files per request
    },
  });

  const observationService = new ObservationService(opts.db);

  const managerRoles = requireRole(['superusuario', 'admin', 'manager']);
  const tecnicoRole = requireRole(['tecnico', 'tecnico_de_campo']);
  const allAuthenticated = requireRole(['superusuario', 'admin', 'manager', 'tecnico', 'tecnico_de_campo']);

  // POST /api/reactivos/:id/observations — create observation with attachments
  fastify.post(
    '/api/reactivos/:id/observations',
    { preHandler: [managerRoles] },
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
        const parts = request.parts();
        let content = '';
        const files: FileUploadData[] = [];

        for await (const part of parts) {
          if (part.type === 'field') {
            if (part.fieldname === 'content') {
              content = part.value as string;
            }
          } else if (part.type === 'file') {
            const buffer = await part.toBuffer();
            files.push({
              buffer,
              originalName: part.filename,
              mimeType: part.mimetype,
              sizeBytes: buffer.length,
            });
          }
        }

        const bodyResult = createObservationBodySchema.safeParse({ content });
        if (!bodyResult.success) {
          return reply.status(400).send({
            statusCode: 400,
            code: 'VALIDATION_ERROR',
            message: 'El contenido de la observación es obligatorio',
            details: bodyResult.error.flatten().fieldErrors,
            timestamp: new Date().toISOString(),
            requestId: request.id,
          });
        }

        const observation = await observationService.create(
          paramResult.data.id,
          bodyResult.data.content,
          files,
          request.user,
        );

        return reply.status(201).send(observation);
      } catch (error) {
        if (error instanceof ObservationError) {
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

  // GET /api/reactivos/:id/observations — list observations for a reactivo
  fastify.get(
    '/api/reactivos/:id/observations',
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
        const observations = await observationService.getByReactivo(paramResult.data.id);
        return reply.status(200).send(observations);
      } catch (error) {
        if (error instanceof ObservationError) {
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

  // PATCH /api/observations/:id/read — mark as read
  fastify.patch(
    '/api/observations/:id/read',
    { preHandler: [tecnicoRole] },
    async (request, reply) => {
      const paramResult = observationIdParamSchema.safeParse(request.params);
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
        await observationService.markAsRead(paramResult.data.id, request.user);
        return reply.status(200).send({
          message: 'Observación marcada como leída',
        });
      } catch (error) {
        if (error instanceof ObservationError) {
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

  // GET /api/observations/unread — unread observations for technician
  fastify.get(
    '/api/observations/unread',
    { preHandler: [tecnicoRole] },
    async (request, reply) => {
      try {
        const observations = await observationService.getUnreadByTecnico(request.user.sub);
        return reply.status(200).send(observations);
      } catch (error) {
        if (error instanceof ObservationError) {
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

  // GET /api/observations/:id/files/:fileId — download file
  fastify.get(
    '/api/observations/:id/files/:fileId',
    { preHandler: [allAuthenticated] },
    async (request, reply) => {
      const paramResult = fileIdParamSchema.safeParse(request.params);
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

      try {
        // Fetch file record
        const fileResult = await opts.db
          .select()
          .from(observationFiles)
          .where(eq(observationFiles.id, paramResult.data.fileId))
          .limit(1);

        const file = fileResult[0];
        if (!file || file.observationId !== paramResult.data.id) {
          return reply.status(404).send({
            statusCode: 404,
            code: 'OBS_008',
            message: 'Archivo no encontrado',
            timestamp: new Date().toISOString(),
            requestId: request.id,
          });
        }

        // Generate presigned URL and redirect
        const url = await getFileUrl(file.storageKey);
        return reply.redirect(url);
      } catch (error) {
        if (error instanceof ObservationError) {
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
