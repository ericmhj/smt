/**
 * Validation Rule Template Routes
 *
 * CRUD endpoints for platform-level validation rule templates.
 * These are global rules associated with form types that all tenants inherit.
 *
 * @module rule-template.routes
 * @requirements 10.1, 10.2, 10.3, 10.4, 10.5, 10.6
 */

import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import { validationRuleTemplates } from '../../db/schema/index.js';
import {
  createRuleTemplateSchema,
  updateRuleTemplateSchema,
} from './validation.schemas.js';
import { insertAuditLog } from './audit-helper.js';

export async function ruleTemplateRoutes(
  fastify: FastifyInstance,
  opts: { db: Database },
): Promise<void> {
  const { db } = opts;

  const ALLOWED_ROLES = ['platform_admin', 'superusuario', 'admin'];

  function requirePlatformRole(request: any, reply: any): boolean {
    if (!request.user || !ALLOWED_ROLES.includes(request.user.role)) {
      reply.status(403).send({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Acceso denegado: se requiere rol de administrador de plataforma',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
      return false;
    }
    return true;
  }

  // GET /api/validation-rules — list all rule templates (optional filter by form_type)
  fastify.get('/api/validation-rules', async (request, reply) => {
    const { form_type } = request.query as { form_type?: string };

    let rules;
    if (form_type) {
      rules = await db
        .select()
        .from(validationRuleTemplates)
        .where(eq(validationRuleTemplates.formType, form_type));
    } else {
      rules = await db.select().from(validationRuleTemplates);
    }

    return reply.status(200).send(rules);
  });

  // POST /api/validation-rules — create a new rule template
  fastify.post('/api/validation-rules', async (request, reply) => {
    if (!requirePlatformRole(request, reply)) return;
    const parseResult = createRuleTemplateSchema.safeParse(request.body);

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
      const [result] = await db
        .insert(validationRuleTemplates)
        .values({
          formType: parseResult.data.form_type,
          name: parseResult.data.name,
          description: parseResult.data.description || null,
          sections: parseResult.data.sections,
          createdBy: actorId || null,
        })
        .returning();

      await insertAuditLog(db, request, {
        action: 'create',
        entityType: 'rule_template',
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
          code: 'DUPLICATE_RULE_NAME',
          message: `Ya existe una regla con nombre "${parseResult.data.name}" para form_type "${parseResult.data.form_type}"`,
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }
      throw error;
    }
  });

  // GET /api/validation-rules/:id — get rule template by ID
  fastify.get('/api/validation-rules/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const [rule] = await db
      .select()
      .from(validationRuleTemplates)
      .where(eq(validationRuleTemplates.id, id));

    if (!rule) {
      return reply.status(404).send({
        statusCode: 404,
        code: 'RULE_TEMPLATE_NOT_FOUND',
        message: 'Regla no encontrada',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }

    return reply.status(200).send(rule);
  });

  // PUT /api/validation-rules/:id — update rule template
  fastify.put('/api/validation-rules/:id', async (request, reply) => {
    if (!requirePlatformRole(request, reply)) return;
    const { id } = request.params as { id: string };

    const parseResult = updateRuleTemplateSchema.safeParse(request.body);
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
      .from(validationRuleTemplates)
      .where(eq(validationRuleTemplates.id, id));

    if (!existing) {
      return reply.status(404).send({
        statusCode: 404,
        code: 'RULE_TEMPLATE_NOT_FOUND',
        message: 'Regla no encontrada',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }

    const updateValues: Record<string, unknown> = { updatedAt: new Date() };
    if (parseResult.data.form_type) updateValues.formType = parseResult.data.form_type;
    if (parseResult.data.name) updateValues.name = parseResult.data.name;
    if (parseResult.data.description !== undefined) updateValues.description = parseResult.data.description || null;
    if (parseResult.data.sections) updateValues.sections = parseResult.data.sections;

    const actorId = request.user?.sub || request.user?.id;
    updateValues.updatedBy = actorId || null;

    const [updated] = await db
      .update(validationRuleTemplates)
      .set(updateValues)
      .where(eq(validationRuleTemplates.id, id))
      .returning();

    await insertAuditLog(db, request, {
      action: 'update',
      entityType: 'rule_template',
      entityId: updated.id,
      details: {
        previous: { name: existing.name, form_type: existing.formType },
        new: { name: updated.name, form_type: updated.formType },
      },
    });

    return reply.status(200).send(updated);
  });

  // DELETE /api/validation-rules/:id — delete rule template
  fastify.delete('/api/validation-rules/:id', async (request, reply) => {
    if (!requirePlatformRole(request, reply)) return;
    const { id } = request.params as { id: string };

    const deleted = await db
      .delete(validationRuleTemplates)
      .where(eq(validationRuleTemplates.id, id))
      .returning();

    if (deleted.length === 0) {
      return reply.status(404).send({
        statusCode: 404,
        code: 'RULE_TEMPLATE_NOT_FOUND',
        message: 'Regla no encontrada',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }

    await insertAuditLog(db, request, {
      action: 'delete',
      entityType: 'rule_template',
      entityId: deleted[0].id,
      details: { name: deleted[0].name, form_type: deleted[0].formType },
    });

    return reply.status(204).send();
  });

  // PATCH /api/validation-rules/:id/toggle — toggle is_active
  fastify.patch('/api/validation-rules/:id/toggle', async (request, reply) => {
    if (!requirePlatformRole(request, reply)) return;
    const { id } = request.params as { id: string };

    const [existing] = await db
      .select()
      .from(validationRuleTemplates)
      .where(eq(validationRuleTemplates.id, id));

    if (!existing) {
      return reply.status(404).send({
        statusCode: 404,
        code: 'RULE_TEMPLATE_NOT_FOUND',
        message: 'Regla no encontrada',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }

    const [updated] = await db
      .update(validationRuleTemplates)
      .set({ isActive: !existing.isActive, updatedAt: new Date() })
      .where(eq(validationRuleTemplates.id, id))
      .returning();

    await insertAuditLog(db, request, {
      action: 'toggle',
      entityType: 'rule_template',
      entityId: updated.id,
      details: {
        previous: { is_active: existing.isActive },
        new: { is_active: updated.isActive },
      },
    });

    return reply.status(200).send(updated);
  });
}
