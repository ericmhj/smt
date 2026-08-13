import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { eq } from 'drizzle-orm';
import { getRedisClient } from '../../lib/redis.js';
import { tenants } from '../../db/schema/platform.js';
import { db } from '../../db/index.js';
import { getSqlClient } from '../../db/index.js';

export interface TenantContext {
  tenantId: string;
  tenantSlug: string;
  schemaName: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    tenantContext?: TenantContext;
  }
}

const DEFAULT_TENANT_SLUG = 'default';
const TENANT_CACHE_TTL = 60; // seconds

/**
 * Checks if the given URL is a platform route that skips tenant resolution.
 */
function isPlatformRoute(url: string): boolean {
  return url.startsWith('/api/platform/') || url.startsWith('/api/platform') || url.startsWith('/api/form-templates') || url.startsWith('/api/validation-rules') || url.startsWith('/api/calculation-rules') || url.startsWith('/api/report-templates') || url.startsWith('/api/report-themes') || url.startsWith('/api/platform/tenant-forms') || url.startsWith('/api/platform/tenant-form-detail');
}

/**
 * Checks if the given URL is a public/health route that skips tenant resolution.
 */
function isPublicRoute(url: string): boolean {
  return (
    url.startsWith('/api/health') ||
    url.startsWith('/api/docs') ||
    url.startsWith('/api/auth/login') ||
    url.startsWith('/api/v1/auth/login') ||
    url.startsWith('/api/auth/refresh') ||
    url.startsWith('/api/v1/auth/refresh')
  );
}

/**
 * Extracts subdomain from the Host header.
 * Returns null if no subdomain (localhost, IP, bare domain).
 */
function extractSubdomain(host: string | undefined): string | null {
  if (!host) return null;

  // Remove port if present
  const hostWithoutPort = host.split(':')[0]!;

  // Skip bare localhost and IPs
  if (
    hostWithoutPort === 'localhost' ||
    hostWithoutPort === '127.0.0.1' ||
    /^\d+\.\d+\.\d+\.\d+$/.test(hostWithoutPort)
  ) {
    return null;
  }

  const parts = hostWithoutPort.split('.');

  // Handle X.localhost pattern (e.g., "acme.localhost")
  if (parts.length === 2 && parts[1] === 'localhost') {
    return parts[0]!;
  }

  // Handle X.domain.tld pattern (e.g., "acme.sgr.com")
  if (parts.length >= 3) {
    return parts[0]!;
  }

  return null;
}

interface TenantCacheEntry {
  id: string;
  status: string;
}

async function resolveTenantFromDb(slug: string): Promise<TenantCacheEntry | null> {
  const result = await db
    .select({ id: tenants.id, status: tenants.status })
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1);

  if (result.length === 0) return null;
  return { id: result[0]!.id, status: result[0]!.status };
}

async function resolveTenantCached(slug: string): Promise<TenantCacheEntry | null> {
  const redis = getRedisClient();
  const cacheKey = `tenant:${slug}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as TenantCacheEntry;
    }
  } catch {
    // Redis unavailable, fall through to DB
  }

  const tenant = await resolveTenantFromDb(slug);
  if (tenant) {
    try {
      const redis = getRedisClient();
      await redis.set(cacheKey, JSON.stringify(tenant), 'EX', TENANT_CACHE_TTL);
    } catch {
      // Cache write failure is non-critical
    }
  }

  return tenant;
}

async function tenantMiddlewarePlugin(fastify: FastifyInstance): Promise<void> {
  // preHandler hook: resolve tenant and set search_path
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip for public routes
    if (isPublicRoute(request.url)) {
      return;
    }

    // Platform routes: set search_path to public only, no tenant resolution needed
    if (isPlatformRoute(request.url)) {
      const sql = getSqlClient();
      await sql.unsafe(`SET LOCAL search_path TO public`);
      return;
    }

    // Determine tenant slug
    let tenantSlug: string | null = null;

    // Platform admin can override tenant context via X-Tenant-Slug header
    if (request.user && request.user.role === 'platform_admin') {
      const headerSlug = request.headers['x-tenant-slug'] as string | undefined;
      if (headerSlug && headerSlug !== 'default') {
        tenantSlug = headerSlug;
      }
    }

    // First try: extract from JWT payload (already decoded by auth middleware)
    if (!tenantSlug && request.user && request.user.tenantSlug) {
      tenantSlug = request.user.tenantSlug;
    }

    // Second try: X-Tenant-Slug header (sent by frontend)
    if (!tenantSlug) {
      const headerSlug = request.headers['x-tenant-slug'] as string | undefined;
      if (headerSlug) {
        tenantSlug = headerSlug;
      }
    }

    // Third try: extract from Host header subdomain (useful for login flow)
    if (!tenantSlug) {
      const subdomain = extractSubdomain(request.headers.host);
      tenantSlug = subdomain || DEFAULT_TENANT_SLUG;
    }

    // Resolve tenant from cache/DB
    const tenant = await resolveTenantCached(tenantSlug);

    if (!tenant) {
      return reply.status(404).send({
        statusCode: 404,
        code: 'TENANT_NOT_FOUND',
        message: `Tenant '${tenantSlug}' no encontrado`,
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }

    // Check tenant status
    if (tenant.status === 'suspended' || tenant.status === 'pending_deletion') {
      return reply.status(403).send({
        statusCode: 403,
        code: 'TENANT_SUSPENDED',
        message: 'El tenant se encuentra suspendido',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      });
    }

    // Set tenant context on request
    const sanitizedSlug = tenantSlug.replace(/-/g, '_');
    const schemaName = `sgr_${sanitizedSlug}`;
    request.tenantContext = {
      tenantId: tenant.id,
      tenantSlug,
      schemaName,
    };

    // Set search_path for this session
    const sql = getSqlClient();
    await sql.unsafe(`SET search_path TO ${schemaName}, public`);
  });
}

export const tenantMiddleware = fp(tenantMiddlewarePlugin, {
  name: 'tenant-middleware',
  dependencies: ['auth-middleware'],
});
