import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getSqlClient } from '../../db/index.js';
import { toSchemaName } from '../../lib/tenant-schema.js';

/**
 * Platform routes for viewing/editing individual tenant forms.
 * Separated to avoid route conflicts with /api/platform/tenants/:slug/forms
 */
export async function tenantFormDetailRoutes(fastify: FastifyInstance): Promise<void> {
  // Guard: require platform_admin or superusuario
  fastify.addHook('preHandler', (request: FastifyRequest, reply: FastifyReply, done: () => void) => {
    if (!request.user || (request.user.role !== 'platform_admin' && request.user.role !== 'superusuario')) {
      reply.status(403).send({
        statusCode: 403,
        code: 'PLATFORM_ACCESS_DENIED',
        message: 'Se requiere rol platform_admin',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
      return;
    }
    done();
  });

  // GET /api/platform/tenant-form-detail/:slug/:formId
  fastify.get('/api/platform/tenant-form-detail/:slug/:formId', async (request, reply) => {
    const { slug, formId } = request.params as { slug: string; formId: string };
    const sqlClient = getSqlClient();
    const schemaName = toSchemaName(slug);

    try {
      const formResult = await sqlClient.unsafe(
        `SELECT id, name, slug, is_active, current_version, template_id, form_type, created_at, updated_at
         FROM ${schemaName}.forms WHERE id = $1 LIMIT 1`,
        [formId],
      );
      const form = formResult[0];
      if (!form) {
        return reply.status(404).send({
          statusCode: 404,
          code: 'FORM_NOT_FOUND',
          message: 'Formulario no encontrado en el tenant',
        });
      }

      const versionResult = await sqlClient.unsafe(
        `SELECT html_content, sanitized_html, fields_metadata, version_number
         FROM ${schemaName}.form_versions
         WHERE form_id = $1 AND version_number = $2 LIMIT 1`,
        [formId, form.current_version],
      );
      const version = versionResult[0];

      return reply.status(200).send({
        id: form.id,
        name: form.name,
        slug: form.slug,
        isActive: form.is_active,
        currentVersion: form.current_version,
        templateId: form.template_id,
        formType: form.form_type,
        createdAt: form.created_at,
        updatedAt: form.updated_at,
        currentVersionData: version
          ? {
              htmlContent: version.html_content,
              sanitizedHtml: version.sanitized_html,
              fieldsMetadata: version.fields_metadata,
              versionNumber: version.version_number,
            }
          : null,
      });
    } catch {
      return reply.status(404).send({
        statusCode: 404,
        code: 'TENANT_NOT_FOUND',
        message: `Tenant "${slug}" no encontrado o sin schema`,
      });
    }
  });

  // PUT /api/platform/tenant-form-detail/:slug/:formId
  fastify.put('/api/platform/tenant-form-detail/:slug/:formId', async (request, reply) => {
    const { slug, formId } = request.params as { slug: string; formId: string };
    const body = request.body as { html?: string; newName?: string };
    const sqlClient = getSqlClient();
    const schemaName = toSchemaName(slug);

    if (!body.html) {
      return reply.status(400).send({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'El campo html es requerido',
      });
    }

    try {
      const formResult = await sqlClient.unsafe(
        `SELECT id, name, current_version, template_id FROM ${schemaName}.forms WHERE id = $1 LIMIT 1`,
        [formId],
      );
      const form = formResult[0];
      if (!form) {
        return reply.status(404).send({
          statusCode: 404,
          code: 'FORM_NOT_FOUND',
          message: 'Formulario no encontrado',
        });
      }

      // Structural validation if template exists
      if (form.template_id) {
        const templateResult = await sqlClient.unsafe(
          `SELECT fields_metadata FROM public.form_templates WHERE id = $1`,
          [form.template_id],
        );
        const template = templateResult[0];
        if (template) {
          const { validateStructure } = await import('../validation/structural-validator.js');
          const fieldsMetadata = template.fields_metadata as {
            sections: Array<{ sectionName: string; fields: string[] }>;
          };
          const result = validateStructure(body.html, fieldsMetadata);
          if (!result.valid) {
            return reply.status(400).send({
              statusCode: 400,
              error: 'STRUCTURAL_VALIDATION_FAILED',
              message: 'El formulario no cumple con la estructura del template',
              missingFields: result.missingFields,
              missingSections: result.missingSections,
            });
          }
        }
      }

      const newVersion = form.current_version + 1;
      const creatorId = request.user?.sub || null;

      await sqlClient.unsafe(
        `INSERT INTO ${schemaName}.form_versions (form_id, version_number, html_content, sanitized_html, json_schema, fields_metadata, change_type, created_by)
         VALUES ($1, $2, $3, $3, '{"type":"object","properties":{},"required":[]}', '{"sections":[]}', 'update', $4)`,
        [formId, newVersion, body.html, creatorId],
      );

      if (body.newName) {
        await sqlClient.unsafe(
          `UPDATE ${schemaName}.forms SET current_version = $2, updated_at = NOW(), name = $3 WHERE id = $1`,
          [formId, newVersion, body.newName],
        );
      } else {
        await sqlClient.unsafe(
          `UPDATE ${schemaName}.forms SET current_version = $2, updated_at = NOW() WHERE id = $1`,
          [formId, newVersion],
        );
      }

      const updatedResult = await sqlClient.unsafe(
        `SELECT id, name, slug, is_active, current_version, updated_at FROM ${schemaName}.forms WHERE id = $1`,
        [formId],
      );

      return reply.status(200).send({
        message: 'Formulario actualizado',
        form: updatedResult[0],
        newVersion,
      });
    } catch (error) {
      throw error;
    }
  });
}
