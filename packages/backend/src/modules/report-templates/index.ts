/**
 * Report Templates Engine - Module Entry Point
 *
 * Registers all report template sub-routes as a Fastify plugin.
 *
 * @module report-templates
 */

import type { FastifyInstance } from 'fastify';
import type { Database } from '../../db/index.js';
import { reportTemplateRoutes } from './report-template.routes.js';
import { activationRoutes } from './activation.routes.js';
import { reportTemplateOverrideRoutes } from './override.routes.js';
import { themeCatalogRoutes } from './theme-catalog.routes.js';

export async function reportTemplatesModule(
  fastify: FastifyInstance,
  opts: { db: Database },
): Promise<void> {
  // Platform-level report template CRUD
  await fastify.register(reportTemplateRoutes, opts);

  // Tenant-level activation routes
  await fastify.register(activationRoutes, opts);

  // Tenant-level override routes
  await fastify.register(reportTemplateOverrideRoutes, opts);

  // Theme catalog routes (public read)
  await fastify.register(themeCatalogRoutes, opts);
}
