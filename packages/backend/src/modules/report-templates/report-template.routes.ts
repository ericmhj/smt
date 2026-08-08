/**
 * Report Template Routes (Platform Admin)
 *
 * CRUD endpoints for platform-level report template management.
 * These are global templates defining PDF structure per form_type.
 *
 * @module report-template.routes
 * @requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 1.3, 3.1, 3.2
 */

import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import { reportTemplates } from '../../db/schema/index.js';
import {
  createReportTemplateSchema,
  updateReportTemplateSchema,
} from './report-template.schemas.js';
import { insertAuditLog } from './audit-helper.js';

export async function reportTemplateRoutes(
  fastify: FastifyInstance,
  opts: { db: Database },
): Promise<void> {
  const { db } = opts;

  // GET /api/report-templates — list all report templates (optional filters)
  fastify.get('/api/report-templates', async (request, reply) => {
    const { form_type, tenant_slug, tenant_form_id } = request.query as {
      form_type?: string;
      tenant_slug?: string;
      tenant_form_id?: string;
    };

    let templates;
    if (tenant_form_id) {
      templates = await db
        .select()
        .from(reportTemplates)
        .where(eq(reportTemplates.tenantFormId, tenant_form_id));
    } else if (tenant_slug) {
      templates = await db
        .select()
        .from(reportTemplates)
        .where(eq(reportTemplates.tenantSlug, tenant_slug));
    } else if (form_type) {
      templates = await db
        .select()
        .from(reportTemplates)
        .where(eq(reportTemplates.formType, form_type));
    } else {
      templates = await db.select().from(reportTemplates);
    }

    return reply.status(200).send(templates);
  });

  // POST /api/report-templates — create a new report template
  fastify.post('/api/report-templates', async (request, reply) => {
    const parseResult = createReportTemplateSchema.safeParse(request.body);

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

    try {
      const actorId = request.user?.sub || request.user?.id;
      const formType = parseResult.data.form_type ?? null;

      // If creating an active template, deactivate any existing active for this form_type
      if (formType) {
        await db
          .update(reportTemplates)
          .set({ isActive: false, updatedAt: new Date() })
          .where(
            and(
              eq(reportTemplates.formType, formType),
              eq(reportTemplates.isActive, true),
            ),
          );
      }

      const [result] = await db
        .insert(reportTemplates)
        .values({
          formType,
          name: parseResult.data.name,
          description: parseResult.data.description || null,
          sections: parseResult.data.sections,
          tenantSlug: parseResult.data.tenant_slug ?? null,
          tenantFormId: parseResult.data.tenant_form_id ?? null,
          parentTemplateId: parseResult.data.parent_template_id ?? null,
          createdBy: actorId || null,
        })
        .returning();

      await insertAuditLog(db, request, {
        action: 'create',
        entityType: 'report_template',
        entityId: result.id,
        details: {
          new: { form_type: result.formType, name: result.name, is_active: result.isActive },
        },
      });

      return reply.status(201).send(result);
    } catch (error: any) {
      if (error?.code === '23505') {
        return reply.status(409).send({
          statusCode: 409,
          code: 'DUPLICATE_TEMPLATE_NAME',
          message: `Ya existe un template con nombre "${parseResult.data.name}" para form_type "${parseResult.data.form_type}"`,
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }
      throw error;
    }
  });

  // GET /api/report-templates/:id — get report template by ID
  fastify.get('/api/report-templates/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const [template] = await db
      .select()
      .from(reportTemplates)
      .where(eq(reportTemplates.id, id));

    if (!template) {
      return reply.status(404).send({
        statusCode: 404,
        code: 'TEMPLATE_NOT_FOUND',
        message: 'Template de reporte no encontrado',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }

    return reply.status(200).send(template);
  });

  // PUT /api/report-templates/:id — update report template
  fastify.put('/api/report-templates/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const parseResult = updateReportTemplateSchema.safeParse(request.body);
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

    const [existing] = await db
      .select()
      .from(reportTemplates)
      .where(eq(reportTemplates.id, id));

    if (!existing) {
      return reply.status(404).send({
        statusCode: 404,
        code: 'TEMPLATE_NOT_FOUND',
        message: 'Template de reporte no encontrado',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }

    const updateValues: Record<string, unknown> = { updatedAt: new Date() };
    if (parseResult.data.form_type !== undefined) updateValues.formType = parseResult.data.form_type;
    if (parseResult.data.name) updateValues.name = parseResult.data.name;
    if (parseResult.data.description !== undefined) updateValues.description = parseResult.data.description || null;
    if (parseResult.data.sections) updateValues.sections = parseResult.data.sections;

    const actorId = request.user?.sub || request.user?.id;
    updateValues.updatedBy = actorId || null;

    try {
      const [updated] = await db
        .update(reportTemplates)
        .set(updateValues)
        .where(eq(reportTemplates.id, id))
        .returning();

      await insertAuditLog(db, request, {
        action: 'update',
        entityType: 'report_template',
        entityId: updated.id,
        details: {
          previous: { name: existing.name, form_type: existing.formType },
          new: { name: updated.name, form_type: updated.formType },
        },
      });

      return reply.status(200).send(updated);
    } catch (error: any) {
      if (error?.code === '23505') {
        return reply.status(409).send({
          statusCode: 409,
          code: 'DUPLICATE_TEMPLATE_NAME',
          message: `Ya existe un template con ese nombre para el form_type especificado`,
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }
      throw error;
    }
  });

  // DELETE /api/report-templates/:id — delete report template
  fastify.delete('/api/report-templates/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const deleted = await db
      .delete(reportTemplates)
      .where(eq(reportTemplates.id, id))
      .returning();

    if (deleted.length === 0) {
      return reply.status(404).send({
        statusCode: 404,
        code: 'TEMPLATE_NOT_FOUND',
        message: 'Template de reporte no encontrado',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }

    await insertAuditLog(db, request, {
      action: 'delete',
      entityType: 'report_template',
      entityId: deleted[0].id,
      details: { name: deleted[0].name, form_type: deleted[0].formType },
    });

    return reply.status(204).send();
  });

  // PATCH /api/report-templates/:id/toggle — toggle is_active
  fastify.patch('/api/report-templates/:id/toggle', async (request, reply) => {
    const { id } = request.params as { id: string };

    const [existing] = await db
      .select()
      .from(reportTemplates)
      .where(eq(reportTemplates.id, id));

    if (!existing) {
      return reply.status(404).send({
        statusCode: 404,
        code: 'TEMPLATE_NOT_FOUND',
        message: 'Template de reporte no encontrado',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }

    const newActiveState = !existing.isActive;

    // If activating, deactivate any other active template for the same form_type
    if (newActiveState && existing.formType) {
      await db
        .update(reportTemplates)
        .set({ isActive: false, updatedAt: new Date() })
        .where(
          and(
            eq(reportTemplates.formType, existing.formType),
            eq(reportTemplates.isActive, true),
          ),
        );
    }

    const [updated] = await db
      .update(reportTemplates)
      .set({ isActive: newActiveState, updatedAt: new Date() })
      .where(eq(reportTemplates.id, id))
      .returning();

    await insertAuditLog(db, request, {
      action: 'toggle',
      entityType: 'report_template',
      entityId: updated.id,
      details: {
        previous: { is_active: existing.isActive },
        new: { is_active: updated.isActive },
      },
    });

    return reply.status(200).send(updated);
  });
}
