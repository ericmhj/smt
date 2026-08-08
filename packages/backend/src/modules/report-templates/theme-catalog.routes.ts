/**
 * Theme Catalog Routes
 *
 * Serves the built-in theme catalog and palette generation utility.
 *
 * @module theme-catalog.routes
 */

import type { FastifyInstance } from 'fastify';
import type { Database } from '../../db/index.js';
import { BASE_THEMES, PREDEFINED_PALETTES, generatePalette } from './report-theme.catalog.js';

export async function themeCatalogRoutes(
  fastify: FastifyInstance,
  _opts: { db: Database },
): Promise<void> {
  // GET /api/report-themes/catalog — list all base themes
  fastify.get('/api/report-themes/catalog', async (_request, reply) => {
    return reply.status(200).send({
      themes: BASE_THEMES,
      palettes: PREDEFINED_PALETTES,
    });
  });

  // GET /api/report-themes/palette?color=#hex — generate palette from color
  fastify.get('/api/report-themes/palette', async (request, reply) => {
    const { color } = request.query as { color?: string };

    if (!color || !/^#[0-9a-fA-F]{6}$/.test(color)) {
      return reply.status(400).send({
        statusCode: 400,
        code: 'INVALID_COLOR',
        message: 'Se requiere un color hex válido (e.g. #2563eb)',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }

    const palette = generatePalette(color);
    return reply.status(200).send(palette);
  });
}
