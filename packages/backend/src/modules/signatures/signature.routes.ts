import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { SignatureService } from './signature.service.js';
import { SignatureError } from './signature.errors.js';
import { requireRole } from '../users/rbac.middleware.js';
import { signatureTypeSchema, signatureIdParamSchema } from './signature.schemas.js';
import type { Database } from '../../db/index.js';

export async function signatureRoutes(
  fastify: FastifyInstance,
  opts: { db: Database },
): Promise<void> {
  // Register multipart plugin for this scope
  await fastify.register(multipart, {
    limits: {
      fileSize: 5 * 1024 * 1024, // 5 MB max for signature images
    },
  });

  const signatureService = new SignatureService(opts.db);

  const managerRoles = requireRole(['superusuario', 'admin', 'manager']);
  const verifyRoles = requireRole(['superusuario', 'admin', 'manager']);

  // POST /api/signatures — register/update digital signature
  fastify.post(
    '/api/signatures',
    { preHandler: [managerRoles] },
    async (request, reply) => {
      try {
        const data = await request.file();

        if (!data) {
          return reply.status(400).send({
            statusCode: 400,
            code: 'VALIDATION_ERROR',
            message: 'Se requiere un archivo de imagen de firma',
            timestamp: new Date().toISOString(),
            requestId: request.id,
          });
        }

        // Get the type from the fields
        const typeField = data.fields['type'];
        let typeValue: string | undefined;

        if (typeField && 'value' in typeField) {
          typeValue = typeField.value as string;
        }

        const typeResult = signatureTypeSchema.safeParse(typeValue);
        if (!typeResult.success) {
          return reply.status(400).send({
            statusCode: 400,
            code: 'VALIDATION_ERROR',
            message: 'El campo type debe ser "upload" o "canvas"',
            timestamp: new Date().toISOString(),
            requestId: request.id,
          });
        }

        const imageBuffer = await data.toBuffer();

        const signature = await signatureService.capture(
          { type: typeResult.data, imageData: imageBuffer },
          request.user,
        );

        return reply.status(201).send(signature);
      } catch (error) {
        if (error instanceof SignatureError) {
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

  // GET /api/signatures/me — get authenticated user's signature
  fastify.get(
    '/api/signatures/me',
    { preHandler: [managerRoles] },
    async (request, reply) => {
      try {
        const signature = await signatureService.getByUser(request.user.sub);

        if (!signature) {
          return reply.status(404).send({
            statusCode: 404,
            code: 'SIG_001',
            message: 'No se encontró firma para este usuario',
            timestamp: new Date().toISOString(),
            requestId: request.id,
          });
        }

        return reply.status(200).send(signature);
      } catch (error) {
        if (error instanceof SignatureError) {
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

  // GET /api/signatures/:id/verify — verify signature integrity
  fastify.get(
    '/api/signatures/:id/verify',
    { preHandler: [verifyRoles] },
    async (request, reply) => {
      const paramResult = signatureIdParamSchema.safeParse(request.params);

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
        const result = await signatureService.verify(paramResult.data.id);
        return reply.status(200).send(result);
      } catch (error) {
        if (error instanceof SignatureError) {
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
