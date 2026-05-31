import type { JWTPayload } from '../modules/auth/auth.types.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: JWTPayload;
  }
}
