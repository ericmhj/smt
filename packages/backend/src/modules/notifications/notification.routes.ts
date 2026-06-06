import type { FastifyInstance } from 'fastify';
import { NotificationService } from './notification.service.js';
import { NotificationError } from './notification.errors.js';
import { requireRole } from '../users/rbac.middleware.js';
import {
  notificationListQuerySchema,
  notificationIdParamSchema,
} from './notification.schemas.js';
import type { Database } from '../../db/index.js';

export async function notificationRoutes(
  fastify: FastifyInstance,
  opts: { db: Database },
): Promise<void> {
  const notificationService = new NotificationService(opts.db);
  const allAuthenticated = requireRole(['superusuario', 'admin', 'manager', 'tecnico', 'asistente']);

  // GET /api/notifications — list notifications for authenticated user
  fastify.get(
    '/api/notifications',
    { preHandler: [allAuthenticated] },
    async (request, reply) => {
      const queryResult = notificationListQuerySchema.safeParse(request.query);
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
        const result = await notificationService.getByUser(
          request.user.sub,
          queryResult.data,
        );
        return reply.status(200).send(result);
      } catch (error) {
        if (error instanceof NotificationError) {
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

  // PATCH /api/notifications/:id/read — mark notification as read
  fastify.patch(
    '/api/notifications/:id/read',
    { preHandler: [allAuthenticated] },
    async (request, reply) => {
      const paramResult = notificationIdParamSchema.safeParse(request.params);
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
        await notificationService.markAsRead(paramResult.data.id, request.user);
        return reply.status(200).send({
          message: 'Notificación marcada como leída',
        });
      } catch (error) {
        if (error instanceof NotificationError) {
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

  // GET /api/notifications/unread-count — get unread count
  fastify.get(
    '/api/notifications/unread-count',
    { preHandler: [allAuthenticated] },
    async (request, reply) => {
      try {
        const count = await notificationService.getUnreadCount(request.user.sub);
        return reply.status(200).send({ count });
      } catch (error) {
        if (error instanceof NotificationError) {
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

  // GET /api/notifications/stream — SSE endpoint for real-time push
  fastify.get(
    '/api/notifications/stream',
    { preHandler: [allAuthenticated] },
    async (request, reply) => {
      const userId = request.user.sub;

      // Set SSE headers
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      // Send initial connection event
      reply.raw.write(`event: connected\ndata: ${JSON.stringify({ userId })}\n\n`);

      // Heartbeat interval (every 30 seconds)
      const heartbeatInterval = setInterval(() => {
        reply.raw.write(`: heartbeat\n\n`);
      }, 30000);

      // Polling interval for new notifications (every 5 seconds)
      const pollInterval = setInterval(async () => {
        try {
          const unreadCount = await notificationService.getUnreadCount(userId);
          reply.raw.write(
            `event: unread-count\ndata: ${JSON.stringify({ count: unreadCount })}\n\n`,
          );
        } catch {
          // Silently ignore polling errors
        }
      }, 5000);

      // Cleanup on connection close
      request.raw.on('close', () => {
        clearInterval(heartbeatInterval);
        clearInterval(pollInterval);
      });

      // Don't end the reply — keep connection open
      await new Promise(() => {});
    },
  );
}
