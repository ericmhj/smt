import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { FormService } from './form.service.js';
import { FormError } from './form.errors.js';
import { requireRole } from '../users/rbac.middleware.js';
import { createFormSchema, updateFormSchema, formFiltersSchema, createFormFromTemplateSchema, associateTemplateSchema } from './form.schemas.js';
import { formTemplates } from '../../db/schema/validation.js';
import { forms, formVersions } from '../../db/schema/forms.js';
import { validateStructure, type FieldsMetadata } from '../validation/structural-validator.js';
import type { Database } from '../../db/index.js';

export async function formRoutes(
  fastify: FastifyInstance,
  opts: { db: Database },
): Promise<void> {
  const formService = new FormService(opts.db);

  const adminRoles = requireRole(['superusuario', 'admin', 'platform_admin']);
  const readRoles = requireRole(['superusuario', 'admin', 'manager', 'tecnico', 'asistente']);

  // POST /api/forms — create form from HTML
  fastify.post(
    '/api/forms',
    { preHandler: [adminRoles] },
    async (request, reply) => {
      const parseResult = createFormSchema.safeParse(request.body);

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
        const result = await formService.create(
          parseResult.data.html,
          { name: parseResult.data.name },
          request.user,
        );
        return reply.status(201).send(result);
      } catch (error) {
        if (error instanceof FormError) {
          return reply.status(error.statusCode).send({
            statusCode: error.statusCode,
            code: error.code,
            message: error.message,
            timestamp: new Date().toISOString(),
            requestId: request.id,
          });
        }
        throw error;
      }
    },
  );

  // POST /api/forms/from-template — create form from template with structural validation
  fastify.post(
    '/api/forms/from-template',
    { preHandler: [adminRoles] },
    async (request, reply) => {
      const parseResult = createFormFromTemplateSchema.safeParse(request.body);

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

      const { templateId, html, name } = parseResult.data;

      // Load the form template by templateId
      const templateResults = await opts.db
        .select()
        .from(formTemplates)
        .where(eq(formTemplates.id, templateId));

      const template = templateResults[0];
      if (!template) {
        return reply.status(404).send({
          statusCode: 404,
          code: 'TEMPLATE_NOT_FOUND',
          message: 'El template de formulario no fue encontrado',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      // Run structural validation against the parent template
      const fieldsMetadata = template.fieldsMetadata as FieldsMetadata;
      const structuralResult = validateStructure(html, fieldsMetadata);

      if (!structuralResult.valid) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'STRUCTURAL_VALIDATION_FAILED',
          message: 'El formulario no cumple con la estructura del template padre',
          missingFields: structuralResult.missingFields,
          missingSections: structuralResult.missingSections,
        });
      }

      // Structural validation passed — create the form with template_id and form_type
      try {
        const result = await formService.create(
          html,
          { name },
          request.user,
          { templateId: template.id, formType: template.formType },
        );
        return reply.status(201).send(result);
      } catch (error) {
        if (error instanceof FormError) {
          return reply.status(error.statusCode).send({
            statusCode: error.statusCode,
            code: error.code,
            message: error.message,
            timestamp: new Date().toISOString(),
            requestId: request.id,
          });
        }
        throw error;
      }
    },
  );

  // POST /api/forms/:formId/associate-template — associate legacy form with a parent template
  fastify.post(
    '/api/forms/:formId/associate-template',
    { preHandler: [adminRoles] },
    async (request, reply) => {
      const { formId } = request.params as { formId: string };

      // Validate body
      const parseResult = associateTemplateSchema.safeParse(request.body);
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

      const { templateId } = parseResult.data;

      // Validate formId is a UUID
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(formId)) {
        return reply.status(400).send({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          message: 'formId debe ser un UUID válido',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      // Get the form — verify it exists and is currently legacy
      const formResult = await opts.db
        .select()
        .from(forms)
        .where(eq(forms.id, formId))
        .limit(1);

      const form = formResult[0];
      if (!form) {
        return reply.status(404).send({
          statusCode: 404,
          code: 'FORM_NOT_FOUND',
          message: 'Formulario no encontrado',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      // Verify the form is legacy (template_id is null or form_type is 'legacy')
      if (form.templateId !== null && form.formType !== 'legacy') {
        return reply.status(400).send({
          statusCode: 400,
          code: 'FORM_ALREADY_ASSOCIATED',
          message: 'El formulario ya está asociado a un template',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      // Get the template by templateId
      const templateResults = await opts.db
        .select()
        .from(formTemplates)
        .where(eq(formTemplates.id, templateId));

      const template = templateResults[0];
      if (!template) {
        return reply.status(404).send({
          statusCode: 404,
          code: 'TEMPLATE_NOT_FOUND',
          message: 'El template de formulario no fue encontrado',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      // Get the form's current version HTML
      const versionResult = await opts.db
        .select()
        .from(formVersions)
        .where(
          and(
            eq(formVersions.formId, formId),
            eq(formVersions.versionNumber, form.currentVersion),
          ),
        )
        .limit(1);

      const currentVersion = versionResult[0];
      if (!currentVersion) {
        return reply.status(404).send({
          statusCode: 404,
          code: 'VERSION_NOT_FOUND',
          message: 'Versión actual del formulario no encontrada',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      // Run structural validation
      const fieldsMetadata = template.fieldsMetadata as FieldsMetadata;
      const structuralResult = validateStructure(currentVersion.htmlContent, fieldsMetadata);

      // Whether structural validation passes or fails, update the form
      await opts.db
        .update(forms)
        .set({
          templateId: template.id,
          formType: template.formType,
          updatedAt: new Date(),
        })
        .where(eq(forms.id, formId));

      // Fetch the updated form
      const updatedFormResult = await opts.db
        .select()
        .from(forms)
        .where(eq(forms.id, formId))
        .limit(1);

      const updatedForm = updatedFormResult[0]!;

      // Return 200 with updated form and structural validation result
      const response: Record<string, unknown> = {
        form: {
          id: updatedForm.id,
          name: updatedForm.name,
          slug: updatedForm.slug,
          isActive: updatedForm.isActive,
          currentVersion: updatedForm.currentVersion,
          templateId: updatedForm.templateId,
          formType: updatedForm.formType,
          createdBy: updatedForm.createdBy,
          createdAt: updatedForm.createdAt.toISOString(),
          updatedAt: updatedForm.updatedAt.toISOString(),
        },
        structurallyValid: structuralResult.valid,
      };

      if (!structuralResult.valid) {
        response.missingFields = structuralResult.missingFields;
        response.missingSections = structuralResult.missingSections;
      }

      return reply.status(200).send(response);
    },
  );

  // PUT /api/forms/:id — update form
  fastify.put(
    '/api/forms/:id',
    { preHandler: [adminRoles] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parseResult = updateFormSchema.safeParse(request.body);

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
        const result = await formService.update(
          id,
          parseResult.data.html,
          request.user,
          parseResult.data.newName,
        );
        return reply.status(200).send(result);
      } catch (error) {
        if (error instanceof FormError) {
          return reply.status(error.statusCode).send({
            statusCode: error.statusCode,
            code: error.code,
            message: error.message,
            timestamp: new Date().toISOString(),
            requestId: request.id,
          });
        }
        throw error;
      }
    },
  );

  // PATCH /api/forms/:id/activate — activate form
  fastify.patch(
    '/api/forms/:id/activate',
    { preHandler: [adminRoles] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        await formService.activate(id, request.user);
        return reply.status(200).send({
          message: 'Formulario activado exitosamente',
        });
      } catch (error) {
        if (error instanceof FormError) {
          return reply.status(error.statusCode).send({
            statusCode: error.statusCode,
            code: error.code,
            message: error.message,
            timestamp: new Date().toISOString(),
            requestId: request.id,
          });
        }
        throw error;
      }
    },
  );

  // PATCH /api/forms/:id/deactivate — deactivate form
  fastify.patch(
    '/api/forms/:id/deactivate',
    { preHandler: [adminRoles] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        await formService.deactivate(id, request.user);
        return reply.status(200).send({
          message: 'Formulario desactivado exitosamente',
        });
      } catch (error) {
        if (error instanceof FormError) {
          return reply.status(error.statusCode).send({
            statusCode: error.statusCode,
            code: error.code,
            message: error.message,
            timestamp: new Date().toISOString(),
            requestId: request.id,
          });
        }
        throw error;
      }
    },
  );

  // GET /api/forms — list forms
  fastify.get(
    '/api/forms',
    { preHandler: [readRoles] },
    async (request, reply) => {
      const parseResult = formFiltersSchema.safeParse(request.query);

      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          message: 'Parámetros de consulta inválidos',
          details: parseResult.error.flatten().fieldErrors,
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      try {
        const filters = { ...parseResult.data };
        const userRole = request.user.role;
        // Manager sees only active forms by default; showAll=true bypasses this (used by kanban filter dropdown)
        if (userRole === 'manager' && filters.isActive === undefined && !filters.showAll) {
          filters.isActive = true;
        }
        delete (filters as Record<string, unknown>).showAll;

        const result = await formService.findAll(filters);
        return reply.status(200).send(result);
      } catch (error) {
        if (error instanceof FormError) {
          return reply.status(error.statusCode).send({
            statusCode: error.statusCode,
            code: error.code,
            message: error.message,
            timestamp: new Date().toISOString(),
            requestId: request.id,
          });
        }
        throw error;
      }
    },
  );

  // GET /api/forms/:id — form detail
  fastify.get(
    '/api/forms/:id',
    { preHandler: [readRoles] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        const form = await formService.findById(id);
        return reply.status(200).send(form);
      } catch (error) {
        if (error instanceof FormError) {
          return reply.status(error.statusCode).send({
            statusCode: error.statusCode,
            code: error.code,
            message: error.message,
            timestamp: new Date().toISOString(),
            requestId: request.id,
          });
        }
        throw error;
      }
    },
  );

  // GET /api/forms/:id/versions — version history
  fastify.get(
    '/api/forms/:id/versions',
    { preHandler: [adminRoles] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        const versions = await formService.getVersionHistory(id);
        return reply.status(200).send(versions);
      } catch (error) {
        if (error instanceof FormError) {
          return reply.status(error.statusCode).send({
            statusCode: error.statusCode,
            code: error.code,
            message: error.message,
            timestamp: new Date().toISOString(),
            requestId: request.id,
          });
        }
        throw error;
      }
    },
  );

  // GET /api/forms/:id/render — Serve form HTML as standalone page with submit logic
  fastify.get(
    '/api/forms/:id/render',
    { preHandler: [readRoles] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const tenantSlug = request.user?.tenantSlug || 'default';
      const userId = request.user?.sub || '';
      const port = (request.server.addresses()?.[0] as { port?: number })?.port || 3001;
      const apiBase = `${request.protocol}://${request.hostname}:${port}`;

      // Escape values for safe embedding in JavaScript strings (prevent XSS)
      const safeTenantSlug = JSON.stringify(tenantSlug).slice(1, -1);
      const safeId = JSON.stringify(id).slice(1, -1);
      const safeApiBase = JSON.stringify(apiBase).slice(1, -1);

      try {
        const form = await formService.findById(id);
        const htmlContent = form.currentVersionData?.htmlContent || '';

        // Create scoped form session cookie (replaces JWT in HTML)
        const { createFormSessionToken, buildFormSessionCookie } = await import('../../lib/form-session.js');
        const sessionToken = await createFormSessionToken(userId, id, tenantSlug);
        reply.header('Set-Cookie', buildFormSessionCookie(sessionToken));

        const submitScript = `
<script>
(function() {
  var bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#fff;border-top:2px solid #1a6b3a;padding:16px 24px;display:flex;gap:12px;justify-content:center;z-index:9999;box-shadow:0 -4px 12px rgba(0,0,0,0.1)';
  bar.innerHTML = '<button id="btn-submit" style="background:#1a6b3a;color:white;border:none;padding:12px 32px;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer">Enviar Formulario</button><button id="btn-cancel" style="background:#6b7280;color:white;border:none;padding:12px 32px;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer">Cancelar</button>';
  document.body.appendChild(bar);
  document.body.style.paddingBottom = '80px';

  document.getElementById('btn-cancel').onclick = function() { window.close(); };
  document.getElementById('btn-submit').onclick = function() {
    var btn = this;
    btn.textContent = 'Enviando...'; btn.disabled = true;
    var inputs = document.querySelectorAll('input,select,textarea');
    var r = {};
    inputs.forEach(function(el) {
      var n = el.getAttribute('name'); if(!n) return;
      if(el.type==='checkbox') r[n]=el.checked;
      else if(el.type==='radio'){if(el.checked)r[n]=el.value;}
      else if(el.type==='number') r[n]=el.value===''?null:Number(el.value);
      else r[n]=el.value;
    });
    fetch('${safeApiBase}/api/reactivos',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json','X-Tenant-Slug':'${safeTenantSlug}'},body:JSON.stringify({formId:'${safeId}',responses:r})})
    .then(function(res){if(!res.ok)return res.json().then(function(d){throw new Error(d.message||'Error')});return res.json();})
    .then(function(){
      document.body.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:16px;font-family:system-ui"><div style="width:64px;height:64px;border-radius:50%;background:#dcfce7;display:flex;align-items:center;justify-content:center;font-size:32px">\\u2713</div><h2 style="color:#166534;margin:0">Formulario enviado</h2><p style="color:#6b7280">Esta ventana se cerrara...</p></div>';
      setTimeout(function(){window.close();},2000);
    })
    .catch(function(err){alert('Error: '+err.message);btn.textContent='Enviar Formulario';btn.disabled=false;});
  };
})();
<\/script>`;

        let fullHtml = htmlContent;
        if (fullHtml.includes('</body>')) {
          fullHtml = fullHtml.replace('</body>', submitScript + '\n</body>');
        } else {
          fullHtml = fullHtml + submitScript;
        }

        reply.header('Content-Type', 'text/html; charset=utf-8');
        reply.header('Cache-Control', 'no-store');
        return reply.send(fullHtml);
      } catch (error) {
        if (error instanceof FormError) {
          reply.header('Content-Type', 'text/html');
          return reply.status(error.statusCode).send(`<h1>Error</h1><p>${error.message}</p>`);
        }
        throw error;
      }
    },
  );

  // GET /api/forms/:id/schema — JSON schema of current version
  fastify.get(
    '/api/forms/:id/schema',
    { preHandler: [readRoles] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        const schema = await formService.getSchema(id);
        return reply.status(200).send(schema);
      } catch (error) {
        if (error instanceof FormError) {
          return reply.status(error.statusCode).send({
            statusCode: error.statusCode,
            code: error.code,
            message: error.message,
            timestamp: new Date().toISOString(),
            requestId: request.id,
          });
        }
        throw error;
      }
    },
  );

  // DELETE /api/forms/:id — delete form (superusuario only)
  const superOnly = requireRole(['superusuario']);
  fastify.delete(
    '/api/forms/:id',
    { preHandler: [superOnly] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        await formService.delete(id, request.user);
        return reply.status(200).send({ message: 'Formulario eliminado exitosamente' });
      } catch (error) {
        if (error instanceof FormError) {
          return reply.status(error.statusCode).send({
            statusCode: error.statusCode,
            code: error.code,
            message: error.message,
            timestamp: new Date().toISOString(),
            requestId: request.id,
          });
        }
        throw error;
      }
    },
  );
}
