import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, count } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '../../db/index.js';
import { getSqlClient } from '../../db/index.js';
import { tenants } from '../../db/schema/platform.js';
import { TenantLifecycleService, TenantLifecycleError } from './tenant-lifecycle.service.js';
import type { KeycloakAdminClient } from '../tenant/keycloak-admin-client.js';

/**
 * Extracts theme colors and font from form HTML.
 * Strategy: find ALL hex colors in the document, count frequency, pick the most common non-neutral.
 */
function extractThemeFromHtml(html: string): {
  primaryColor: string;
  fontFamily: string;
  headerStyle: string;
  tableStyle: string;
} {
  const result = {
    primaryColor: '#2563eb',
    fontFamily: 'Helvetica, Arial, sans-serif',
    headerStyle: 'full',
    tableStyle: 'bordered',
  };

  // 1. Extract ALL 6-char hex colors from the entire HTML
  const hex6Matches = html.match(/#[0-9a-fA-F]{6}\b/g) || [];

  // 2. Also extract 3-char hex colors and expand them
  const hex3Matches = html.match(/#[0-9a-fA-F]{3}\b/g) || [];
  const expandedHex3 = hex3Matches.map((h) => {
    const c = h.slice(1);
    return `#${c[0]}${c[0]}${c[1]}${c[1]}${c[2]}${c[2]}`;
  });

  const allColors = [...hex6Matches, ...expandedHex3].map((c) => c.toLowerCase());

  // 3. Count frequency, exclude neutrals
  const colorCounts: Record<string, number> = {};
  for (const color of allColors) {
    if (!isNeutralColor(color)) {
      colorCounts[color] = (colorCounts[color] || 0) + 1;
    }
  }

  // 4. Sort by frequency — most common non-neutral = primary color
  const sorted = Object.entries(colorCounts).sort((a, b) => b[1] - a[1]);
  if (sorted.length > 0) {
    result.primaryColor = sorted[0]![0];
  }

  // 5. Extract font-family (try CSS variable first, then direct property)
  const fontVarMatch = html.match(/--font[\w-]*\s*:\s*'([^']+)'/i) || html.match(/--font[\w-]*\s*:\s*"([^"]+)"/i);
  if (fontVarMatch && fontVarMatch[1]) {
    result.fontFamily = fontVarMatch[1];
  } else {
    const fontMatch = html.match(/font-family\s*:\s*'([^']+)'/i) || html.match(/font-family\s*:\s*"([^"]+)"/i) || html.match(/font-family\s*:\s*([^;}"']+)/i);
    if (fontMatch && fontMatch[1]) {
      const font = fontMatch[1].trim().replace(/['"]/g, '');
      if (font.length > 0 && font.length < 100) {
        result.fontFamily = font;
      }
    }
  }

  // 6. Detect header style
  if (/background[^:]*:[^;]*#[0-9a-fA-F]/i.test(html) || /--green|--primary|--brand/i.test(html)) {
    result.headerStyle = 'full';
  } else {
    result.headerStyle = 'minimal';
  }

  // 7. Detect table style
  if (/border-collapse/i.test(html) || /border\s*=\s*["']1["']/i.test(html)) {
    result.tableStyle = 'bordered';
  } else {
    result.tableStyle = 'minimal';
  }

  return result;
}

/**
 * Check if a hex color is neutral (black, white, or gray).
 */
function isNeutralColor(hex: string): boolean {
  const clean = hex.replace('#', '');
  let r: number, g: number, b: number;

  if (clean.length === 3) {
    r = parseInt(clean[0]! + clean[0]!, 16);
    g = parseInt(clean[1]! + clean[1]!, 16);
    b = parseInt(clean[2]! + clean[2]!, 16);
  } else {
    r = parseInt(clean.substring(0, 2), 16);
    g = parseInt(clean.substring(2, 4), 16);
    b = parseInt(clean.substring(4, 6), 16);
  }

  // Check if it's grayscale (r ≈ g ≈ b) or very light/dark
  const maxDiff = Math.max(r, g, b) - Math.min(r, g, b);
  if (maxDiff < 30) return true; // grayscale
  if (r + g + b < 60) return true; // too dark (near black)
  if (r + g + b > 700) return true; // too light (near white)

  return false;
}

const createTenantSchema = z.object({
  slug: z.string().min(3).max(50),
  nombre: z.string().min(1).max(255),
  plan: z.string().min(1).max(50).default('starter'),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(8),
});

const listTenantsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(['active', 'suspended', 'pending_deletion']).optional(),
});

/**
 * Guard that verifies the user has the platform_admin role.
 */
function requirePlatformAdmin(request: FastifyRequest, reply: FastifyReply, done: () => void) {
  if (!request.user || request.user.role !== 'platform_admin') {
    reply.status(403).send({
      statusCode: 403,
      code: 'PLATFORM_ACCESS_DENIED',
      message: 'Se requiere rol platform_admin para acceder a esta ruta',
      timestamp: new Date().toISOString(),
      requestId: request.id,
    });
    return;
  }
  done();
}

export async function platformRoutes(
  fastify: FastifyInstance,
  opts: { db: Database; keycloakAdmin?: KeycloakAdminClient; standaloneAuth?: boolean },
): Promise<void> {
  const lifecycleService = new TenantLifecycleService(opts.db, opts.keycloakAdmin);

  // All platform routes require platform_admin role
  fastify.addHook('preHandler', requirePlatformAdmin);

  // POST /api/platform/tenants — Create a new tenant
  fastify.post('/api/platform/tenants', async (request: FastifyRequest, reply: FastifyReply) => {
    const parseResult = createTenantSchema.safeParse(request.body);

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
      const tenant = await lifecycleService.createTenant(parseResult.data);
      return reply.status(201).send(tenant);
    } catch (error) {
      if (error instanceof TenantLifecycleError) {
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
  });

  // GET /api/platform/tenants — List tenants (paginated)
  fastify.get('/api/platform/tenants', async (request: FastifyRequest, reply: FastifyReply) => {
    const parseResult = listTenantsQuerySchema.safeParse(request.query);

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

    const { page, limit, status } = parseResult.data;
    const offset = (page - 1) * limit;

    let data;
    let total: number;

    if (status) {
      data = await opts.db
        .select()
        .from(tenants)
        .where(eq(tenants.status, status))
        .limit(limit)
        .offset(offset);

      const [countResult] = await opts.db
        .select({ total: count() })
        .from(tenants)
        .where(eq(tenants.status, status));
      total = countResult?.total || 0;
    } else {
      data = await opts.db
        .select()
        .from(tenants)
        .limit(limit)
        .offset(offset);

      const [countResult] = await opts.db
        .select({ total: count() })
        .from(tenants);
      total = countResult?.total || 0;
    }

    // Enrich with admin email for each tenant
    const sqlClient = getSqlClient();
    const enrichedData = await Promise.all(
      data.map(async (t) => {
        let adminEmail = '';
        try {
          const adminRes = await sqlClient.unsafe(
            `SELECT email FROM sgr_${t.slug}.users WHERE role = 'admin' LIMIT 1`
          );
          adminEmail = adminRes[0]?.email || '';
        } catch { /* schema may not exist */ }
        return { ...t, adminEmail };
      })
    );

    return reply.status(200).send({
      data: enrichedData,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  });

  // GET /api/platform/tenants/:id — Tenant detail with metrics
  fastify.get('/api/platform/tenants/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const result = await opts.db
      .select()
      .from(tenants)
      .where(eq(tenants.id, id))
      .limit(1);

    if (result.length === 0) {
      return reply.status(404).send({
        statusCode: 404,
        code: 'TENANT_NOT_FOUND',
        message: 'Tenant no encontrado',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }

    const tenant = result[0]!;

    // Get user count and admin email from tenant schema
    let userCount = 0;
    let adminEmail = '';
    try {
      const sqlClient = getSqlClient();
      const schemaName = `sgr_${tenant.slug}`;
      const countRes = await sqlClient.unsafe(
        `SELECT COUNT(*)::int as count FROM ${schemaName}.users`,
      );
      userCount = countRes[0]?.count || 0;

      const adminRes = await sqlClient.unsafe(
        `SELECT email FROM ${schemaName}.users WHERE role = 'admin' LIMIT 1`,
      );
      adminEmail = adminRes[0]?.email || '';
    } catch {
      // Schema might not exist yet
    }

    return reply.status(200).send({
      ...tenant,
      metrics: {
        userCount,
        adminEmail,
      },
    });
  });

  // PUT /api/platform/tenants/:id/suspend — Suspend a tenant
  fastify.put('/api/platform/tenants/:id/suspend', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    try {
      const tenant = await lifecycleService.suspendTenant(id);
      return reply.status(200).send(tenant);
    } catch (error) {
      if (error instanceof TenantLifecycleError) {
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
  });

  // PUT /api/platform/tenants/:id/activate — Reactivate a tenant
  fastify.put('/api/platform/tenants/:id/activate', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    try {
      const tenant = await lifecycleService.activateTenant(id);
      return reply.status(200).send(tenant);
    } catch (error) {
      if (error instanceof TenantLifecycleError) {
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
  });

  // DELETE /api/platform/tenants/:id — Schedule deletion
  fastify.delete('/api/platform/tenants/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    try {
      const tenant = await lifecycleService.scheduleDeletion(id);
      return reply.status(200).send(tenant);
    } catch (error) {
      if (error instanceof TenantLifecycleError) {
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
  });

  // PUT /api/platform/tenants/:id/reset-password — Reset admin password
  fastify.put('/api/platform/tenants/:id/reset-password', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { newPassword?: string };

    if (!body.newPassword || body.newPassword.length < 6) {
      return reply.status(400).send({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'La contraseña debe tener al menos 6 caracteres',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }

    const result = await opts.db
      .select()
      .from(tenants)
      .where(eq(tenants.id, id))
      .limit(1);

    if (result.length === 0) {
      return reply.status(404).send({
        statusCode: 404,
        code: 'TENANT_NOT_FOUND',
        message: 'Tenant no encontrado',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }

    const tenant = result[0]!;
    const bcrypt = await import('bcrypt');
    const passwordHash = await bcrypt.default.hash(body.newPassword, 10);
    const sqlClient = getSqlClient();
    const schemaName = `sgr_${tenant.slug}`;

    await sqlClient.unsafe(
      `UPDATE ${schemaName}.users SET password_hash = $1 WHERE role = 'admin'`,
      [passwordHash]
    );

    return reply.status(200).send({ message: 'Contraseña reseteada exitosamente' });
  });

  // ─── Tenant Forms Management ─────────────────────────────────────────────

  // GET /api/platform/tenants/:slug/forms — List forms for a specific tenant
  fastify.get('/api/platform/tenants/:slug/forms', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const sqlClient = getSqlClient();
    const sanitizedSlug = slug.replace(/-/g, '_');
    const schemaName = `sgr_${sanitizedSlug}`;

    try {
      const forms = await sqlClient.unsafe(
        `SELECT id, name, slug, is_active, current_version, template_id, form_type, created_at FROM ${schemaName}.forms ORDER BY created_at DESC`,
      );
      return reply.status(200).send(forms);
    } catch {
      return reply.status(404).send({
        statusCode: 404,
        code: 'TENANT_NOT_FOUND',
        message: `Tenant "${slug}" no encontrado o sin schema`,
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }
  });

  // POST /api/platform/tenants/:slug/forms/from-template — Create form in tenant from template
  fastify.post('/api/platform/tenants/:slug/forms/from-template', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const body = request.body as { templateId?: string; name?: string; html?: string };

    if (!body.templateId || !body.name || !body.html) {
      return reply.status(400).send({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'templateId, name y html son requeridos',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }

    const sqlClient = getSqlClient();
    const sanitizedSlug = slug.replace(/-/g, '_');
    const schemaName = `sgr_${sanitizedSlug}`;

    // 1. Load the template
    const templateResult = await sqlClient.unsafe(
      `SELECT id, form_type, fields_metadata, html_content FROM public.form_templates WHERE id = $1`,
      [body.templateId],
    );
    const template = templateResult[0];
    if (!template) {
      return reply.status(404).send({
        statusCode: 404,
        code: 'TEMPLATE_NOT_FOUND',
        message: 'Template no encontrado',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }

    // 2. Structural validation
    const { validateStructure } = await import('../validation/structural-validator.js');
    const fieldsMetadata = template.fields_metadata as { sections: Array<{ sectionName: string; fields: string[] }> };
    const structuralResult = validateStructure(body.html, fieldsMetadata);

    if (!structuralResult.valid) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'STRUCTURAL_VALIDATION_FAILED',
        message: 'El formulario no cumple con la estructura del template padre',
        missingFields: structuralResult.missingFields,
        missingSections: structuralResult.missingSections,
      });
    }

    // 3. Create form in tenant schema
    const formSlug = body.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    try {
      // Get first admin user in the tenant for created_by
      const adminResult = await sqlClient.unsafe(
        `SELECT id FROM ${schemaName}.users WHERE role IN ('admin', 'superusuario') LIMIT 1`,
      );
      const creatorId = adminResult[0]?.id;
      if (!creatorId) {
        return reply.status(400).send({
          statusCode: 400,
          code: 'NO_ADMIN_USER',
          message: 'El tenant no tiene un usuario admin para asignar como creador',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      // Insert form
      const formResult = await sqlClient.unsafe(
        `INSERT INTO ${schemaName}.forms (name, slug, is_active, created_by, current_version, template_id, form_type)
         VALUES ($1, $2, true, $3, 1, $4, $5)
         RETURNING id, name, slug, is_active, current_version, template_id, form_type, created_at`,
        [body.name, formSlug, creatorId, template.id, template.form_type],
      );
      const form = formResult[0];

      // Insert form version
      const jsonSchema = { type: 'object', properties: {}, required: [] };
      await sqlClient.unsafe(
        `INSERT INTO ${schemaName}.form_versions (form_id, version_number, html_content, sanitized_html, json_schema, fields_metadata, change_type, created_by)
         VALUES ($1, 1, $2, $2, $3, $4, 'initial', $5)`,
        [form.id, body.html, JSON.stringify(jsonSchema), JSON.stringify(fieldsMetadata), creatorId],
      );

      return reply.status(201).send(form);
    } catch (error: any) {
      if (error?.code === '23505') {
        return reply.status(409).send({
          statusCode: 409,
          code: 'DUPLICATE_SLUG',
          message: `Ya existe un formulario con slug "${formSlug}" en el tenant`,
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }
      throw error;
    }
  });

  // ─── Report Template Activations per Tenant (Platform Admin) ──────────────

  // GET /api/platform/tenants/:slug/report-template-activations
  fastify.get('/api/platform/tenants/:slug/report-template-activations', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const sqlClient = getSqlClient();
    const sanitizedSlug = slug.replace(/-/g, '_');
    const schemaName = `sgr_${sanitizedSlug}`;

    try {
      const activations = await sqlClient.unsafe(
        `SELECT id, report_template_id, activated_by, activated_at, theme_config
         FROM ${schemaName}.report_template_activations
         ORDER BY activated_at DESC`,
      );
      return reply.status(200).send(activations);
    } catch {
      return reply.status(404).send({
        statusCode: 404,
        code: 'TENANT_NOT_FOUND',
        message: `Tenant "${slug}" no encontrado o sin schema`,
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }
  });

  // POST /api/platform/tenants/:slug/report-template-activations
  fastify.post('/api/platform/tenants/:slug/report-template-activations', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const body = request.body as { report_template_id?: string };

    if (!body.report_template_id) {
      return reply.status(400).send({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'report_template_id es requerido',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }

    const sqlClient = getSqlClient();
    const sanitizedSlug = slug.replace(/-/g, '_');
    const schemaName = `sgr_${sanitizedSlug}`;

    try {
      // Get an admin user from the tenant to set as activated_by
      const adminResult = await sqlClient.unsafe(
        `SELECT id FROM ${schemaName}.users WHERE role IN ('admin', 'superusuario', 'platform_admin') LIMIT 1`,
      );
      const activatedBy = adminResult[0]?.id || request.user?.sub || request.user?.id;

      const result = await sqlClient.unsafe(
        `INSERT INTO ${schemaName}.report_template_activations (report_template_id, activated_by)
         VALUES ($1, $2)
         RETURNING id, report_template_id, activated_by, activated_at`,
        [body.report_template_id, activatedBy],
      );

      const activationId = result[0].id;

      // Auto-apply theme from form colors (server-side, no extra request needed)
      try {
        // Get template's form_type
        const templateResult = await sqlClient.unsafe(
          `SELECT form_type FROM public.report_templates WHERE id = $1`, [body.report_template_id],
        );
        const formType = templateResult[0]?.form_type;

        if (formType) {
          // Find form with that form_type in tenant
          const formResult = await sqlClient.unsafe(
            `SELECT id FROM ${schemaName}.forms WHERE form_type = $1 LIMIT 1`, [formType],
          );
          const formId = formResult[0]?.id;

          if (formId) {
            // Get HTML
            const versionResult = await sqlClient.unsafe(
              `SELECT html_content FROM ${schemaName}.form_versions WHERE form_id = $1 ORDER BY version_number DESC LIMIT 1`, [formId],
            );
            const html = versionResult[0]?.html_content as string;

            if (html) {
              const extracted = extractThemeFromHtml(html);
              const hsl = hexToHSLUtil(extracted.primaryColor);
              const palette = {
                primary: extracted.primaryColor,
                primaryLight: hslToHexUtil(hsl.h, hsl.s, Math.min(hsl.l + 20, 92)),
                primaryDark: hslToHexUtil(hsl.h, hsl.s, Math.max(hsl.l - 20, 15)),
                secondary: hslToHexUtil((hsl.h + 180) % 360, hsl.s * 0.7, hsl.l),
                accent: hslToHexUtil((hsl.h + 30) % 360, hsl.s * 0.9, hsl.l),
                neutral: hslToHexUtil(hsl.h, 10, 50),
                background: hslToHexUtil(hsl.h, 5, 98),
                text: hslToHexUtil(hsl.h, 10, 15),
              };
              const themeConfig = {
                baseTheme: 'personalizado',
                palette,
                typography: { fontFamily: extracted.fontFamily, titleSize: 14, bodySize: 11, lineHeight: 1.5 },
                layout: { margins: 'normal', headerStyle: extracted.headerStyle, tableStyle: extracted.tableStyle, separator: 'line' },
                branding: { showLogo: true, logoUrl: null, logoPosition: 'left', showWatermark: false, watermarkText: null },
                footer: { showPageNumbers: true, showDate: true, customText: null },
              };
              await sqlClient.unsafe(
                `UPDATE ${schemaName}.report_template_activations SET theme_config = $1 WHERE id = $2`,
                [JSON.stringify(themeConfig), activationId],
              );
            }
          }
        }
      } catch (autoThemeError) {
        // Non-blocking: activation was created, theme just uses defaults
        console.warn('[AutoTheme] Error applying auto-theme on activation:', autoThemeError);
      }

      return reply.status(201).send(result[0]);
    } catch (error: any) {
      if (error?.message?.includes('does not exist')) {
        return reply.status(404).send({
          statusCode: 404,
          code: 'TENANT_NOT_FOUND',
          message: `Tenant "${slug}" no encontrado o sin schema`,
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }
      throw error;
    }
  });

  // DELETE /api/platform/tenants/:slug/report-template-activations/:id
  fastify.delete('/api/platform/tenants/:slug/report-template-activations/:id', async (request, reply) => {
    const { slug, id } = request.params as { slug: string; id: string };
    const sqlClient = getSqlClient();
    const sanitizedSlug = slug.replace(/-/g, '_');
    const schemaName = `sgr_${sanitizedSlug}`;

    try {
      const result = await sqlClient.unsafe(
        `DELETE FROM ${schemaName}.report_template_activations
         WHERE id = $1
         RETURNING id`,
        [id],
      );

      if (result.length === 0) {
        return reply.status(404).send({
          statusCode: 404,
          code: 'ACTIVATION_NOT_FOUND',
          message: 'Activación no encontrada',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      return reply.status(204).send();
    } catch {
      return reply.status(404).send({
        statusCode: 404,
        code: 'TENANT_NOT_FOUND',
        message: `Tenant "${slug}" no encontrado o sin schema`,
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }
  });

  // GET /api/platform/tenants/:slug/forms/:formId/extract-theme
  fastify.get('/api/platform/tenants/:slug/forms/:formId/extract-theme', async (request, reply) => {
    const { slug, formId } = request.params as { slug: string; formId: string };
    const sqlClient = getSqlClient();
    const sanitizedSlug = slug.replace(/-/g, '_');
    const schemaName = `sgr_${sanitizedSlug}`;

    try {
      // Get the form's latest version HTML
      const formResult = await sqlClient.unsafe(
        `SELECT fv.html_content
         FROM ${schemaName}.form_versions fv
         JOIN ${schemaName}.forms f ON fv.form_id = f.id
         WHERE f.id = $1
         ORDER BY fv.version_number DESC
         LIMIT 1`,
        [formId],
      );

      if (!formResult || formResult.length === 0) {
        return reply.status(404).send({
          statusCode: 404,
          code: 'FORM_NOT_FOUND',
          message: 'Formulario no encontrado',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      const html = formResult[0].html_content as string;

      // Extract theme from HTML
      const extracted = extractThemeFromHtml(html);
      return reply.status(200).send(extracted);
    } catch {
      return reply.status(404).send({
        statusCode: 404,
        code: 'TENANT_NOT_FOUND',
        message: `Tenant "${slug}" no encontrado o sin schema`,
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }
  });

  // PATCH /api/platform/tenants/:slug/report-template-activations/:id/theme
  fastify.patch('/api/platform/tenants/:slug/report-template-activations/:id/theme', async (request, reply) => {
    const { slug, id } = request.params as { slug: string; id: string };
    const body = request.body as { theme_config: Record<string, unknown> };

    if (!body.theme_config) {
      return reply.status(400).send({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'theme_config es requerido',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }

    const sqlClient = getSqlClient();
    const sanitizedSlug = slug.replace(/-/g, '_');
    const schemaName = `sgr_${sanitizedSlug}`;

    try {
      const result = await sqlClient.unsafe(
        `UPDATE ${schemaName}.report_template_activations
         SET theme_config = $1
         WHERE id = $2
         RETURNING id, report_template_id, theme_config`,
        [JSON.stringify(body.theme_config), id],
      );

      if (result.length === 0) {
        return reply.status(404).send({
          statusCode: 404,
          code: 'ACTIVATION_NOT_FOUND',
          message: 'Activación no encontrada',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      return reply.status(200).send(result[0]);
    } catch {
      return reply.status(404).send({
        statusCode: 404,
        code: 'TENANT_NOT_FOUND',
        message: `Tenant "${slug}" no encontrado o sin schema`,
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }
  });

  // POST /api/platform/tenants/:slug/report-template-activations/:id/auto-theme
  // Extracts theme from the form associated with the template and saves it automatically
  fastify.post('/api/platform/tenants/:slug/report-template-activations/:id/auto-theme', async (request, reply) => {
    const { slug, id } = request.params as { slug: string; id: string };
    const sqlClient = getSqlClient();
    const sanitizedSlug = slug.replace(/-/g, '_');
    const schemaName = `sgr_${sanitizedSlug}`;

    try {
      // 1. Get the activation to find the report_template_id
      const activationResult = await sqlClient.unsafe(
        `SELECT report_template_id FROM ${schemaName}.report_template_activations WHERE id = $1`,
        [id],
      );
      if (!activationResult || activationResult.length === 0) {
        return reply.status(404).send({ statusCode: 404, code: 'ACTIVATION_NOT_FOUND', message: 'Activación no encontrada' });
      }
      const reportTemplateId = activationResult[0].report_template_id;

      // 2. Get the report template's form_type
      const templateResult = await sqlClient.unsafe(
        `SELECT form_type FROM public.report_templates WHERE id = $1`,
        [reportTemplateId],
      );
      if (!templateResult || templateResult.length === 0) {
        return reply.status(404).send({ statusCode: 404, code: 'TEMPLATE_NOT_FOUND', message: 'Template no encontrado' });
      }
      const formType = templateResult[0].form_type;

      // 3. Find the first form in the tenant with that form_type
      const formResult = await sqlClient.unsafe(
        `SELECT f.id FROM ${schemaName}.forms f WHERE f.form_type = $1 LIMIT 1`,
        [formType],
      );
      if (!formResult || formResult.length === 0) {
        return reply.status(404).send({ statusCode: 404, code: 'FORM_NOT_FOUND', message: 'No se encontró un formulario con ese tipo en el tenant' });
      }
      const formId = formResult[0].id;

      // 4. Get the form HTML
      const versionResult = await sqlClient.unsafe(
        `SELECT fv.html_content FROM ${schemaName}.form_versions fv
         WHERE fv.form_id = $1 ORDER BY fv.version_number DESC LIMIT 1`,
        [formId],
      );
      if (!versionResult || versionResult.length === 0) {
        return reply.status(404).send({ statusCode: 404, code: 'FORM_VERSION_NOT_FOUND', message: 'Sin versión del formulario' });
      }
      const html = versionResult[0].html_content as string;

      // 5. Extract theme
      const extracted = extractThemeFromHtml(html);

      // 6. Generate full palette from primary color
      const primary = extracted.primaryColor;
      const hsl = hexToHSLUtil(primary);
      const palette = {
        primary,
        primaryLight: hslToHexUtil(hsl.h, hsl.s, Math.min(hsl.l + 20, 92)),
        primaryDark: hslToHexUtil(hsl.h, hsl.s, Math.max(hsl.l - 20, 15)),
        secondary: hslToHexUtil((hsl.h + 180) % 360, hsl.s * 0.7, hsl.l),
        accent: hslToHexUtil((hsl.h + 30) % 360, hsl.s * 0.9, hsl.l),
        neutral: hslToHexUtil(hsl.h, 10, 50),
        background: hslToHexUtil(hsl.h, 5, 98),
        text: hslToHexUtil(hsl.h, 10, 15),
      };

      // 7. Build theme_config
      const themeConfig = {
        baseTheme: 'personalizado',
        palette,
        typography: { fontFamily: extracted.fontFamily, titleSize: 14, bodySize: 11, lineHeight: 1.5 },
        layout: { margins: 'normal', headerStyle: extracted.headerStyle, tableStyle: extracted.tableStyle, separator: 'line' },
        branding: { showLogo: true, logoUrl: null, logoPosition: 'left', showWatermark: false, watermarkText: null },
        footer: { showPageNumbers: true, showDate: true, customText: null },
      };

      // 8. Save
      await sqlClient.unsafe(
        `UPDATE ${schemaName}.report_template_activations SET theme_config = $1 WHERE id = $2`,
        [JSON.stringify(themeConfig), id],
      );

      return reply.status(200).send({ success: true, themeConfig });
    } catch (error: any) {
      return reply.status(500).send({ statusCode: 500, code: 'AUTO_THEME_ERROR', message: error?.message || 'Error al generar auto-tema' });
    }
  });
}

// ─── Color utility functions for auto-theme ──────────────────────────────────

function hexToHSLUtil(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToHexUtil(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
