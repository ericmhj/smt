/**
 * Form Template Routes
 *
 * Fastify route plugin for platform-level form template CRUD operations.
 * Endpoints are used by the License Service (or CRM Admin) to manage
 * the form template catalog (Formularios Padre).
 *
 * @module form-template.routes
 * @requirements 16.1, 16.2, 16.3, 16.4, 16.5, 16.6
 */

import type { FastifyInstance } from 'fastify';
import type { Database } from '../../db/index.js';
import { FormTemplateService } from './form-template.service.js';
import {
  createFormTemplateSchema,
  updateFormTemplateSchema,
  formTemplateIdParamSchema,
} from './form-template.schemas.js';
import { insertAuditLog } from '../validation/audit-helper.js';

export async function formTemplateRoutes(
  fastify: FastifyInstance,
  opts: { db: Database },
): Promise<void> {
  const service = new FormTemplateService(opts.db);

  // GET /api/form-templates — list active templates (tenant catalog)
  fastify.get('/api/form-templates', async (request, reply) => {
    const templates = await service.list();
    return reply.status(200).send(templates);
  });

  // GET /api/form-templates/all — list all templates including inactive (platform admin)
  fastify.get('/api/form-templates/all', async (request, reply) => {
    const templates = await service.listAll();
    return reply.status(200).send(templates);
  });

  // POST /api/form-templates — create a new template
  fastify.post('/api/form-templates', async (request, reply) => {
    const parseResult = createFormTemplateSchema.safeParse(request.body);

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
      const actorId = request.user?.id;
      const result = await service.create(parseResult.data, actorId);

      // Audit log: rule_template created
      await insertAuditLog(opts.db, request, {
        action: 'create',
        entityType: 'rule_template',
        entityId: result.id,
        details: {
          new: {
            form_type: result.formType,
            name: result.name,
            description: result.description,
            is_active: result.isActive,
          },
        },
      });

      return reply.status(201).send(result);
    } catch (error: any) {
      // Handle unique constraint violation on form_type
      if (error?.code === '23505') {
        return reply.status(409).send({
          statusCode: 409,
          code: 'DUPLICATE_FORM_TYPE',
          message: `Ya existe un template con form_type "${parseResult.data.form_type}"`,
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }
      throw error;
    }
  });

  // GET /api/form-templates/:id — get template by ID
  fastify.get('/api/form-templates/:id', async (request, reply) => {
    const paramResult = formTemplateIdParamSchema.safeParse(request.params);

    if (!paramResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'ID inválido',
        details: paramResult.error.flatten().fieldErrors,
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }

    const template = await service.getById(paramResult.data.id);

    if (!template) {
      return reply.status(404).send({
        statusCode: 404,
        code: 'FORM_TEMPLATE_NOT_FOUND',
        message: 'Template no encontrado',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }

    return reply.status(200).send(template);
  });

  // PUT /api/form-templates/:id — update template (new version)
  fastify.put('/api/form-templates/:id', async (request, reply) => {
    const paramResult = formTemplateIdParamSchema.safeParse(request.params);

    if (!paramResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'ID inválido',
        details: paramResult.error.flatten().fieldErrors,
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }

    const bodyResult = updateFormTemplateSchema.safeParse(request.body);

    if (!bodyResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Datos de entrada inválidos',
        details: bodyResult.error.flatten().fieldErrors,
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }

    const actorId = request.user?.id;
    const previous = await service.getById(paramResult.data.id);
    const result = await service.update(paramResult.data.id, bodyResult.data, actorId);

    if (!result) {
      return reply.status(404).send({
        statusCode: 404,
        code: 'FORM_TEMPLATE_NOT_FOUND',
        message: 'Template no encontrado',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }

    // Audit log: rule_template updated
    await insertAuditLog(opts.db, request, {
      action: 'update',
      entityType: 'rule_template',
      entityId: result.id,
      details: {
        previous: {
          name: previous?.name,
          description: previous?.description,
          current_version: previous?.currentVersion,
          is_active: previous?.isActive,
        },
        new: {
          name: result.name,
          description: result.description,
          current_version: result.currentVersion,
          is_active: result.isActive,
        },
      },
    });

    // Propagate HTML update to all tenant forms that use this template
    if (bodyResult.data.html_content) {
      try {
        const sqlClient = (await import('../../db/index.js')).getSqlClient();
        // Find all tenant schemas
        const schemas = await sqlClient.unsafe(
          `SELECT nspname FROM pg_namespace WHERE nspname LIKE 'sgr_%'`,
        );
        for (const schema of schemas) {
          const schemaName = schema.nspname;
          // Find forms in this tenant that reference this template
          const tenantForms = await sqlClient.unsafe(
            `SELECT id, current_version FROM ${schemaName}.forms WHERE template_id = $1`,
            [paramResult.data.id],
          );
          for (const tf of tenantForms) {
            const newVersion = tf.current_version + 1;
            // Insert new version with updated HTML
            await sqlClient.unsafe(
              `INSERT INTO ${schemaName}.form_versions (form_id, version_number, html_content, sanitized_html, json_schema, fields_metadata, change_type, created_by)
               VALUES ($1, $2, $3, $3, '{"type":"object","properties":{},"required":[]}', '{"sections":[]}', 'template_sync', $4)`,
              [tf.id, newVersion, bodyResult.data.html_content, actorId || null],
            );
            // Update form's current version
            await sqlClient.unsafe(
              `UPDATE ${schemaName}.forms SET current_version = $1, updated_at = NOW() WHERE id = $2`,
              [newVersion, tf.id],
            );
          }
        }
      } catch (propagationError) {
        // Log but don't fail the main update
        request.log.error(propagationError, 'Error propagating template update to tenants');
      }
    }

    return reply.status(200).send(result);
  });

  // PATCH /api/form-templates/:id/toggle — activate/deactivate
  fastify.patch('/api/form-templates/:id/toggle', async (request, reply) => {
    const paramResult = formTemplateIdParamSchema.safeParse(request.params);

    if (!paramResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'ID inválido',
        details: paramResult.error.flatten().fieldErrors,
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }

    const previous = await service.getById(paramResult.data.id);
    const result = await service.toggle(paramResult.data.id);

    if (!result) {
      return reply.status(404).send({
        statusCode: 404,
        code: 'FORM_TEMPLATE_NOT_FOUND',
        message: 'Template no encontrado',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }

    // Audit log: rule_template toggled
    await insertAuditLog(opts.db, request, {
      action: 'toggle',
      entityType: 'rule_template',
      entityId: result.id,
      details: {
        previous: { is_active: previous?.isActive },
        new: { is_active: result.isActive },
      },
    });

    return reply.status(200).send(result);
  });

  // DELETE /api/form-templates/:id — Delete a form template (only if no tenants use it)
  fastify.delete('/api/form-templates/:id', async (request, reply) => {
    const paramResult = formTemplateIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', message: 'ID inválido' });
    }

    const templateId = paramResult.data.id;
    const sqlClient = (await import('../../db/index.js')).getSqlClient();

    // Check if any tenant form uses this template
    try {
      const schemas = await sqlClient.unsafe(`SELECT nspname FROM pg_namespace WHERE nspname LIKE 'sgr_%'`);
      const usages: string[] = [];

      for (const schema of schemas) {
        const result = await sqlClient.unsafe(
          `SELECT count(*) as cnt FROM ${schema.nspname}.forms WHERE template_id = $1`,
          [templateId],
        );
        const count = parseInt(result[0]?.cnt || '0');
        if (count > 0) {
          const tenantSlug = schema.nspname.replace('sgr_', '').replace(/_/g, '-');
          usages.push(`${tenantSlug} (${count})`);
        }
      }

      if (usages.length > 0) {
        return reply.status(409).send({
          statusCode: 409,
          code: 'HAS_RELATIONS',
          message: `No se puede eliminar: este template está en uso por los tenants: ${usages.join(', ')}. Desactívelo en su lugar.`,
        });
      }

      // Safe to delete
      await service.delete(templateId);
      return reply.status(200).send({ message: 'Template eliminado' });
    } catch (error: any) {
      return reply.status(500).send({ statusCode: 500, message: 'Error al eliminar: ' + (error?.message || 'desconocido') });
    }
  });
}
