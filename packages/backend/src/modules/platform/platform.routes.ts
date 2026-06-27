import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, count } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '../../db/index.js';
import { getSqlClient } from '../../db/index.js';
import { tenants } from '../../db/schema/platform.js';
import { TenantLifecycleService, TenantLifecycleError } from './tenant-lifecycle.service.js';

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
  opts: { db: Database },
): Promise<void> {
  const lifecycleService = new TenantLifecycleService(opts.db);

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
}
