/**
 * Report Template Override Routes (Tenant Admin)
 *
 * Endpoints for tenant-level overrides per form instance.
 * Allows deactivating or customizing the template for a specific form.
 *
 * @module override.routes
 * @requirements 5.4, 5.5, 5.6, 5.7
 */

import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import { createOverrideSchema } from './report-template.schemas.js';
import { insertAuditLog } from './audit-helper.js';

export async function reportTemplateOverrideRoutes(
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
        message: 'Sin permisos para gestionar overrides de templates',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }
  });

  // GET /api/forms/:formId/report-overrides — list overrides for a form
  fastify.get('/api/forms/:formId/report-overrides', async (request, reply) => {
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

    const { formId } = request.params as { formId: string };

    const result = await db.execute(
      sql`SELECT id, form_id, report_template_id, override_type, custom_sections, created_by, created_at, updated_at
          FROM ${sql.identifier(tenantSchema)}.report_template_overrides
          WHERE form_id = ${formId}
          ORDER BY created_at DESC`,
    );

    return reply.status(200).send(result.rows);
  });

  // POST /api/forms/:formId/report-overrides — create override
  fastify.post('/api/forms/:formId/report-overrides', async (request, reply) => {
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

    const { formId } = request.params as { formId: string };

    const parseResult = createOverrideSchema.safeParse(request.body);
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
    const { report_template_id, override_type, custom_sections } = parseResult.data;

    const customSectionsJson = custom_sections ? JSON.stringify(custom_sections) : null;

    const result = await db.execute(
      sql`INSERT INTO ${sql.identifier(tenantSchema)}.report_template_overrides
          (form_id, report_template_id, override_type, custom_sections, created_by)
          VALUES (${formId}, ${report_template_id}, ${override_type}, ${customSectionsJson}::jsonb, ${actorId})
          RETURNING id, form_id, report_template_id, override_type, custom_sections, created_by, created_at, updated_at`,
    );

    const override = result.rows[0] as any;

    await insertAuditLog(db, request, {
      action: 'create',
      entityType: 'report_template_override',
      entityId: override.id,
      details: {
        form_id: formId,
        report_template_id,
        override_type,
      },
    });

    return reply.status(201).send(override);
  });

  // DELETE /api/forms/:formId/report-overrides/:overrideId — delete override
  fastify.delete('/api/forms/:formId/report-overrides/:overrideId', async (request, reply) => {
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

    const { formId, overrideId } = request.params as { formId: string; overrideId: string };

    const result = await db.execute(
      sql`DELETE FROM ${sql.identifier(tenantSchema)}.report_template_overrides
          WHERE id = ${overrideId} AND form_id = ${formId}
          RETURNING id, form_id, report_template_id, override_type`,
    );

    if (!result.rows || result.rows.length === 0) {
      return reply.status(404).send({
        statusCode: 404,
        code: 'OVERRIDE_NOT_FOUND',
        message: 'Override no encontrado',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }

    const deleted = result.rows[0] as any;

    await insertAuditLog(db, request, {
      action: 'delete',
      entityType: 'report_template_override',
      entityId: deleted.id,
      details: {
        form_id: deleted.form_id,
        report_template_id: deleted.report_template_id,
        override_type: deleted.override_type,
      },
    });

    return reply.status(204).send();
  });
}
