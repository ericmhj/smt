import Fastify, { FastifyInstance } from 'fastify';

/**
 * Creates a Fastify instance configured for testing.
 * Disables logging by default for cleaner test output.
 */
export function createFastifyTestApp(options?: {
  logger?: boolean;
}): FastifyInstance {
  const app = Fastify({
    logger: options?.logger ?? false,
  });

  return app;
}
