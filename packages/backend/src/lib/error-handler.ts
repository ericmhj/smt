import type { FastifyInstance, FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { ZodError } from 'zod';

/**
 * Known application error base shape.
 * All domain errors (AuthError, FormError, UserError, etc.) follow this pattern.
 */
interface AppError extends Error {
  statusCode: number;
  code: string;
  details?: unknown;
}

function isAppError(error: unknown): error is AppError {
  return (
    error instanceof Error &&
    typeof (error as AppError).statusCode === 'number' &&
    typeof (error as AppError).code === 'string'
  );
}

/**
 * Register the global error handler on the Fastify instance.
 * This should be called BEFORE registering routes.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler(
    (error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) => {
      const timestamp = new Date().toISOString();
      const requestId = request.id;

      // Handle Zod validation errors
      if (error instanceof ZodError) {
        const fieldErrors = error.flatten().fieldErrors;
        request.log.warn({ err: error, requestId }, 'Validation error');

        return reply.status(400).send({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          message: 'Error de validación en los datos de entrada',
          details: fieldErrors,
          timestamp,
          requestId,
        });
      }

      // Handle known application errors (AuthError, FormError, UserError, etc.)
      if (isAppError(error)) {
        const level = error.statusCode >= 500 ? 'error' : 'warn';
        request.log[level]({ err: error, requestId }, error.message);

        const response: Record<string, unknown> = {
          statusCode: error.statusCode,
          code: error.code,
          message: error.message,
          timestamp,
          requestId,
        };

        // Include details (e.g., validation errors array) when present
        if (error.details !== undefined) {
          response.errors = error.details;
        }

        return reply.status(error.statusCode).send(response);
      }

      // Handle Fastify-specific errors (e.g., rate limit, validation)
      if ('statusCode' in error && typeof (error as FastifyError).statusCode === 'number') {
        const fastifyError = error as FastifyError;
        const statusCode = fastifyError.statusCode ?? 500;

        if (statusCode < 500) {
          request.log.warn({ err: error, requestId }, fastifyError.message);
        } else {
          request.log.error({ err: error, requestId }, fastifyError.message);
        }

        return reply.status(statusCode).send({
          statusCode,
          code: fastifyError.code || 'FASTIFY_ERROR',
          message: fastifyError.message,
          timestamp,
          requestId,
        });
      }

      // Unknown/unhandled errors — return generic 500
      request.log.error({ err: error, requestId }, 'Unhandled error');

      const isProduction = process.env.NODE_ENV === 'production';

      return reply.status(500).send({
        statusCode: 500,
        code: 'INTERNAL_ERROR',
        message: isProduction
          ? 'Error interno del servidor'
          : error.message || 'Error interno del servidor',
        timestamp,
        requestId,
      });
    },
  );
}
