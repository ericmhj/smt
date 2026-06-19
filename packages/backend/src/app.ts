import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { db } from './db/index.js';
import { loadConfig } from './lib/config.js';
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

export async function buildApp(): Promise<FastifyInstance> {
  const config = loadConfig();

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

  // Register auth middleware
  await app.register(authMiddleware, { authService });

  // Register tenant resolution middleware (after auth, before routes)
  await app.register(tenantMiddleware);

  // Register auth routes (with stricter rate limit)
  await app.register(authRoutes, { authService });

  // Register platform admin routes (must be before tenant-scoped routes)
  await app.register(platformRoutes, { db });

  // Register user routes
  await app.register(userRoutes, { db });

  // Register form routes
  await app.register(formRoutes, { db });

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
