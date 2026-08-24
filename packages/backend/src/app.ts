import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { db } from './db/index.js';
import { loadConfig, validateConfig } from './lib/config.js';
import { createAuthStrategy } from './modules/auth/auth-strategy.factory.js';
import { registerErrorHandler } from './lib/error-handler.js';
import { registerSwagger } from './lib/swagger.js';
import { helmetConfig, globalRateLimitConfig } from './lib/security.js';
import { AuthService } from './modules/auth/auth.service.js';
import { authMiddleware } from './modules/auth/auth.middleware.js';
import { tenantMiddleware } from './modules/tenant/tenant.middleware.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { userRoutes } from './modules/users/user.routes.js';
import { formRoutes } from './modules/forms/form.routes.js';
import { assignmentRoutes } from './modules/assignments/assignment.routes.js';
import { catalogRoutes } from './modules/catalogs/catalog.routes.js';
import { reactivoRoutes } from './modules/reactivos/reactivo.routes.js';
import { kanbanRoutes } from './modules/kanban/kanban.routes.js';
import { signatureRoutes } from './modules/signatures/signature.routes.js';
import { observationRoutes } from './modules/observations/observation.routes.js';
import { notificationRoutes } from './modules/notifications/notification.routes.js';
import { auditRoutes } from './modules/audit/audit.routes.js';
import { clienteRoutes } from './modules/clientes/cliente.routes.js';
import { documentoRoutes } from './modules/clientes/documento.routes.js';
import { ticketRoutes } from './modules/tickets/ticket.routes.js';
import { platformRoutes } from './modules/platform/platform.routes.js';
import { tenantFormDetailRoutes } from './modules/platform/tenant-form-detail.routes.js';
import { formTemplateRoutes } from './modules/form-templates/form-template.routes.js';
import { toSchemaName } from './lib/tenant-schema.js';
import { overrideRoutes } from './modules/validation/override.routes.js';
import { ruleTemplateRoutes } from './modules/validation/rule-template.routes.js';
import { calculationRuleRoutes } from './modules/calculation/calculation-rule.routes.js';
import { reportTemplatesModule } from './modules/report-templates/index.js';
import { KeycloakAdminClient } from './modules/tenant/keycloak-admin-client.js';

export async function buildApp(): Promise<FastifyInstance> {
  const config = loadConfig();
  validateConfig(config);

  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
  });

  // Register global error handler BEFORE routes
  registerErrorHandler(app);

  // Register Helmet for security headers (CSP, HSTS, X-Frame-Options)
  await app.register(helmet, helmetConfig);

  // Register rate limiting
  await app.register(rateLimit, globalRateLimitConfig);

  // Register CORS
  await app.register(cors, {
    origin: true, // Allow all origins in development
    credentials: true,
  });

  // Prevent browser caching on all API responses
  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store, no-cache, must-revalidate');
    reply.header('Pragma', 'no-cache');
  });

  // Register Swagger/OpenAPI documentation
  await registerSwagger(app);

  // Health check (public route)
  app.get('/api/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Initialize auth service
  const authService = new AuthService(db, {
    privateKey: config.jwt.privateKey,
    publicKey: config.jwt.publicKey,
    accessTokenExpiry: config.jwt.accessTokenExpiry,
    refreshTokenExpiry: config.jwt.refreshTokenExpiry,
    issuer: config.jwt.issuer,
  });
  await authService.initialize();

  // Initialize auth strategy (standalone or Keycloak)
  const authStrategy = await createAuthStrategy(config);

  // Register auth middleware
  await app.register(authMiddleware, { authStrategy });

  // Register tenant resolution middleware (after auth, before routes)
  await app.register(tenantMiddleware);

  // Register auth routes (with stricter rate limit)
  await app.register(authRoutes, { authService, authStrategy });

  // Register platform admin routes (must be before tenant-scoped routes)
  // Note: keycloakAdmin is created here so it's available for both platform and user routes
  const keycloakAdmin = new KeycloakAdminClient({
    baseUrl: config.keycloakAdmin?.baseUrl ?? '',
    realm: config.keycloakAdmin?.targetRealm ?? '',
    adminRealm: config.keycloakAdmin?.adminRealm ?? 'master',
    adminUser: config.keycloakAdmin?.adminUser ?? '',
    adminPassword: config.keycloakAdmin?.adminPassword ?? '',
  });
  await app.register(platformRoutes, { db, keycloakAdmin, standaloneAuth: config.standaloneAuth });

  // Register tenant form detail routes (platform-level, separate to avoid route conflicts)
  await app.register(tenantFormDetailRoutes);

  // Inline route for tenant form detail (backup in case plugin doesn't load)
  app.get('/api/platform/tenant-form-edit/:slug/:formId', async (request, reply) => {
    if (!request.user || (request.user.role !== 'platform_admin' && request.user.role !== 'superusuario')) {
      return reply.status(403).send({ message: 'Acceso denegado' });
    }
    const { slug, formId } = request.params as { slug: string; formId: string };
    const { getSqlClient } = await import('./db/index.js');
    const sqlClient = getSqlClient();
    const schemaName = toSchemaName(slug);
    try {
      const formResult = await sqlClient.unsafe(
        `SELECT id, name, slug, is_active, current_version, template_id, form_type, created_at, updated_at FROM ${schemaName}.forms WHERE id = $1 LIMIT 1`, [formId]);
      const form = formResult[0];
      if (!form) return reply.status(404).send({ message: 'Form not found' });
      const versionResult = await sqlClient.unsafe(
        `SELECT html_content, sanitized_html, fields_metadata, version_number FROM ${schemaName}.form_versions WHERE form_id = $1 ORDER BY version_number DESC LIMIT 1`, [formId]);
      const version = versionResult[0];
      let htmlContent = version?.html_content || null;
      if (!htmlContent && form.template_id) {
        const tmplResult = await sqlClient.unsafe(`SELECT html_content FROM public.form_templates WHERE id = $1`, [form.template_id]);
        htmlContent = tmplResult[0]?.html_content || null;
      }
      return reply.send({ id: form.id, name: form.name, slug: form.slug, isActive: form.is_active, currentVersion: form.current_version, templateId: form.template_id, formType: form.form_type,
        currentVersionData: htmlContent ? { htmlContent, sanitizedHtml: version?.sanitized_html || htmlContent, versionNumber: version?.version_number || 0 } : null });
    } catch { return reply.status(404).send({ message: 'Tenant schema not found' }); }
  });

  app.put('/api/platform/tenant-form-edit/:slug/:formId', async (request, reply) => {
    if (!request.user || (request.user.role !== 'platform_admin' && request.user.role !== 'superusuario')) {
      return reply.status(403).send({ message: 'Acceso denegado' });
    }
    const { slug, formId } = request.params as { slug: string; formId: string };
    const body = request.body as { html?: string; newName?: string };
    if (!body.html) return reply.status(400).send({ message: 'html es requerido' });
    const { getSqlClient } = await import('./db/index.js');
    const sqlClient = getSqlClient();
    const schemaName = toSchemaName(slug);
    try {
      const formResult = await sqlClient.unsafe(`SELECT id, current_version FROM ${schemaName}.forms WHERE id = $1 LIMIT 1`, [formId]);
      const form = formResult[0];
      if (!form) return reply.status(404).send({ message: 'Form not found' });
      const newVersion = form.current_version + 1;
      await sqlClient.unsafe(
        `INSERT INTO ${schemaName}.form_versions (form_id, version_number, html_content, sanitized_html, json_schema, fields_metadata, change_type, created_by) VALUES ($1, $2, $3, $3, '{}', '{}', 'update', $4)`,
        [formId, newVersion, body.html, request.user.sub]);
      if (body.newName) {
        await sqlClient.unsafe(`UPDATE ${schemaName}.forms SET current_version = $2, updated_at = NOW(), name = $3 WHERE id = $1`, [formId, newVersion, body.newName]);
      } else {
        await sqlClient.unsafe(`UPDATE ${schemaName}.forms SET current_version = $2, updated_at = NOW() WHERE id = $1`, [formId, newVersion]);
      }
      return reply.send({ message: 'Formulario actualizado', newVersion });
    } catch (e: any) { return reply.status(500).send({ message: e.message }); }
  });

  // Register user routes
  await app.register(userRoutes, { keycloakAdmin });

  // Register form template routes (platform-level catalog)
  await app.register(formTemplateRoutes, { db });

  // Register form routes
  await app.register(formRoutes, { db });

  // Register validation override routes (tenant-level rule overrides)
  await app.register(overrideRoutes, { db });

  // Register validation rule template routes (platform-level rule CRUD)
  await app.register(ruleTemplateRoutes, { db });

  // Register calculation rule template routes (platform-level calculation CRUD)
  await app.register(calculationRuleRoutes, { db });

  // Register report templates module (platform CRUD + tenant activations/overrides)
  await app.register(reportTemplatesModule, { db });

  // Register assignment routes
  await app.register(assignmentRoutes, { db });

  // Register reactivo routes
  await app.register(reactivoRoutes, { db });

  // Register kanban routes
  await app.register(kanbanRoutes, { db });

  // Register signature routes
  await app.register(signatureRoutes, { db });

  // Register observation routes
  await app.register(observationRoutes, { db });

  // Register notification routes
  await app.register(notificationRoutes, { db });

  // Register audit routes
  await app.register(auditRoutes, { db });

  // Register catalog routes
  await app.register(catalogRoutes, { db });

  // Register cliente routes
  await app.register(clienteRoutes, { db });

  // Register documento routes
  await app.register(documentoRoutes, { db });

  // Register ticket routes
  await app.register(ticketRoutes, { db });

  return app;
}
