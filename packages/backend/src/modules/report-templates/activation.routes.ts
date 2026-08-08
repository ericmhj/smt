/**
 * Report Template Activation Routes (Tenant Admin)
 *
 * Endpoints for tenant-level activation of report templates.
 * A tenant must explicitly activate a template before it applies to their PDFs.
 *
 * @module activation.routes
 * @requirements 4.4, 4.5, 4.6
 */

import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import { createActivationSchema } from './report-template.schemas.js';
import { insertAuditLog } from './audit-helper.js';

export async function activationRoutes(
  fastify: FastifyInstance,
  opts: { db: Database },
): Promise<void> {
  const { db } = opts;

  // Guard: only admin or superusuario
  fastify.addHook('preHandler', async (request, reply) => {
    const role = request.user?.role;
    if (role !== 'admin' && role !== 'superusuario' && role !== 'platform_admin') {
      return reply.status(403).send({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Sin permisos para gestionar activaciones de templates',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }
  });

  // GET /api/report-template-activations — list activations for current tenant
  fastify.get('/api/report-template-activations', async (request, reply) => {
    const tenantSchema = (request as any).tenantSchema;
    if (!tenantSchema) {
      return reply.status(400).send({
        statusCode: 400,
        code: 'TENANT_REQUIRED',
        message: 'Se requiere contexto de tenant',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }

    const result = await db.execute(
      sql`SELECT id, report_template_id, activated_by, activated_at
          FROM ${sql.identifier(tenantSchema)}.report_template_activations
          ORDER BY activated_at DESC`,
    );

    return reply.status(200).send(result.rows);
  });

  // POST /api/report-template-activations — create activation
  fastify.post('/api/report-template-activations', async (request, reply) => {
    const tenantSchema = (request as any).tenantSchema;
    if (!tenantSchema) {
      return reply.status(400).send({
        statusCode: 400,
        code: 'TENANT_REQUIRED',
        message: 'Se requiere contexto de tenant',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }

    const parseResult = createActivationSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Datos de entrada inválidos',
        details: parseResult.error.flatten().fieldErrors,
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }

    const actorId = request.user?.sub || request.user?.id;
    const { report_template_id } = parseResult.data;

    const result = await db.execute(
      sql`INSERT INTO ${sql.identifier(tenantSchema)}.report_template_activations
          (report_template_id, activated_by)
          VALUES (${report_template_id}, ${actorId})
          RETURNING id, report_template_id, activated_by, activated_at`,
    );

    const activation = result.rows[0];

    await insertAuditLog(db, request, {
      action: 'activate',
      entityType: 'report_template_activation',
      entityId: (activation as any).id,
      details: { report_template_id },
    });

    return reply.status(201).send(activation);
  });

  // DELETE /api/report-template-activations/:id — remove activation
  fastify.delete('/api/report-template-activations/:id', async (request, reply) => {
    const tenantSchema = (request as any).tenantSchema;
    if (!tenantSchema) {
      return reply.status(400).send({
        statusCode: 400,
        code: 'TENANT_REQUIRED',
        message: 'Se requiere contexto de tenant',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }

    const { id } = request.params as { id: string };

    const result = await db.execute(
      sql`DELETE FROM ${sql.identifier(tenantSchema)}.report_template_activations
          WHERE id = ${id}
          RETURNING id, report_template_id`,
    );

    if (!result.rows || result.rows.length === 0) {
      return reply.status(404).send({
        statusCode: 404,
        code: 'ACTIVATION_NOT_FOUND',
        message: 'Activación no encontrada',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }

    const deleted = result.rows[0] as any;

    await insertAuditLog(db, request, {
      action: 'deactivate',
      entityType: 'report_template_activation',
      entityId: deleted.id,
      details: { report_template_id: deleted.report_template_id },
    });

    return reply.status(204).send();
  });
}
