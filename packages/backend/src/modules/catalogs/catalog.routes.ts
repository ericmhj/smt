import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import { getRedisClient } from '../../lib/redis.js';

const CACHE_KEY = 'catalog:estados';
const CACHE_TTL = 3600; // 1 hour

export async function catalogRoutes(
  fastify: FastifyInstance,
  opts: { db: Database },
): Promise<void> {
  const redis = getRedisClient();

  // GET /api/catalogs/estados — get state catalog (cached)
  // Public for all authenticated users
  fastify.get('/api/catalogs/estados', async (request, reply) => {
    // Try cache first
    const cached = await redis.get(CACHE_KEY);
    if (cached) {
      return reply.status(200).send(JSON.parse(cached));
    }

    // Query from database
    const result = await opts.db.execute(
      sql`SELECT codigo, etiqueta, color, orden, es_terminal FROM catalogo_estados WHERE activo = true ORDER BY orden`
    );

    const estados = result.rows || result;

    // Cache the result
    await redis.set(CACHE_KEY, JSON.stringify(estados), 'EX', CACHE_TTL);

    return reply.status(200).send(estados);
  });

  // POST /api/catalogs/estados/invalidate — invalidate cache (admin only)
  fastify.post('/api/catalogs/estados/invalidate', async (request, reply) => {
    if (request.user?.role !== 'superusuario') {
      return reply.status(403).send({ message: 'Solo superusuario puede invalidar cache' });
    }
    await redis.del(CACHE_KEY);
    return reply.status(200).send({ message: 'Cache invalidado' });
  });
}
