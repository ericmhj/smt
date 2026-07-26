/**
 * Validation Override Routes
 *
 * Fastify route plugin for tenant-level override management.
 * Endpoints allow tenant admins to deactivate inherited rules,
 * add custom rules, and view the effective rule set for a form.
 *
 * @module override.routes
 * @requirements 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import {
  validationRuleOverrides,
  validationRuleTemplates,
  forms,
} from '../../db/schema/index.js';
import { createOverrideSchema } from './validation.schemas.js';
import { computeEffectiveRuleSet } from './validation-engine.js';
import { insertAuditLog } from './audit-helper.js';

/**
 * Authorization guard: checks that the request user has role 'admin' or 'superusuario'.
 * Returns 403 if unauthorized.
 */
function requireAdminOrSuperusuario(
  request: FastifyRequest,
  reply: FastifyReply,
): boolean {
  const role = request.user?.role;
  if (role !== 'admin' && role !== 'superusuario') {
    reply.status(403).send({
      statusCode: 403,
      code: 'UNAUTHORIZED_RULE_MGMT',
      message: 'Se requiere rol admin o superusuario para gestionar overrides',
      timestamp: new Date().toISOString(),
      requestId: request.id,
    });
    return false;
  }
  return true;
}

export async function overrideRoutes(
  fastify: FastifyInstance,
  opts: { db: Database },
): Promise<void> {
  const { db } = opts;

  // GET /api/forms/:formId/validation-overrides — List all overrides for the form
  fastify.get('/api/forms/:formId/validation-overrides', async (request, reply) => {
    if (!requireAdminOrSuperusuario(request, reply)) return;

    const { formId } = request.params as { formId: string };

    const overrides = await db
      .select()
      .from(validationRuleOverrides)
      .where(eq(validationRuleOverrides.formId, formId));

    return reply.status(200).send(overrides);
  });

  // POST /api/forms/:formId/validation-overrides — Create an override
  fastify.post('/api/forms/:formId/validation-overrides', async (request, reply) => {
    if (!requireAdminOrSuperusuario(request, reply)) return;

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

    const { override_type, rule_template_id, custom_rule } = parseResult.data;

    // If override_type = 'deactivate': verify the rule_template_id exists
    if (override_type === 'deactivate' && rule_template_id) {
      const [existingRule] = await db
        .select({ id: validationRuleTemplates.id })
        .from(validationRuleTemplates)
        .where(eq(validationRuleTemplates.id, rule_template_id));

      if (!existingRule) {
        return reply.status(404).send({
          statusCode: 404,
          code: 'RULE_TEMPLATE_NOT_FOUND',
          message: 'El rule template referenciado no existe',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }
    }

    const actorId = request.user.sub;

    const [inserted] = await db
      .insert(validationRuleOverrides)
      .values({
        formId,
        ruleTemplateId: rule_template_id || null,
        overrideType: override_type,
        customRule: custom_rule || null,
        createdBy: actorId,
      })
      .returning();

    // Audit log: rule_override created
    await insertAuditLog(db, request, {
      action: 'create',
      entityType: 'rule_override',
      entityId: inserted.id,
      details: {
        override_type,
        rule_template_id: rule_template_id || null,
        form_id: formId,
        ...(custom_rule ? { custom_rule } : {}),
      },
    });

    return reply.status(201).send(inserted);
  });

  // DELETE /api/forms/:formId/validation-overrides/:id — Remove an override
  fastify.delete('/api/forms/:formId/validation-overrides/:id', async (request, reply) => {
    if (!requireAdminOrSuperusuario(request, reply)) return;

    const { formId, id } = request.params as { formId: string; id: string };

    const deleted = await db
      .delete(validationRuleOverrides)
      .where(
        and(
          eq(validationRuleOverrides.id, id),
          eq(validationRuleOverrides.formId, formId),
        ),
      )
      .returning();

    if (deleted.length === 0) {
      return reply.status(404).send({
        statusCode: 404,
        code: 'OVERRIDE_NOT_FOUND',
        message: 'Override no encontrado',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }

    // Audit log: rule_override deleted
    const deletedOverride = deleted[0];
    await insertAuditLog(db, request, {
      action: 'delete',
      entityType: 'rule_override',
      entityId: deletedOverride.id,
      details: {
        override_type: deletedOverride.overrideType,
        rule_template_id: deletedOverride.ruleTemplateId,
        form_id: formId,
      },
    });

    return reply.status(204).send();
  });

  // GET /api/forms/:formId/effective-rules — Computed effective rule set
  fastify.get('/api/forms/:formId/effective-rules', async (request, reply) => {
    if (!requireAdminOrSuperusuario(request, reply)) return;

    const { formId } = request.params as { formId: string };

    // Get form to determine form_type
    const [form] = await db
      .select({ formType: forms.formType })
      .from(forms)
      .where(eq(forms.id, formId));

    if (!form) {
      return reply.status(404).send({
        statusCode: 404,
        code: 'FORM_NOT_FOUND',
        message: 'Formulario no encontrado',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }

    const formType = form.formType || 'legacy';
    const effectiveRules = await computeEffectiveRuleSet(db, formType, formId);

    return reply.status(200).send(effectiveRules);
  });
}
