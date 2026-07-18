import type { FastifyRequest } from 'fastify';

/**
 * Extracts the tenant slug from a hostname by returning the first subdomain segment.
 * Examples:
 *   "acme.localhost" → "acme"
 *   "acme.example.com" → "acme"
 *   "localhost" → null
 *   "127.0.0.1" → null
 */
export function extractSubdomainSlug(hostname: string): string | null {
  // Strip port if present
  const host = hostname.split(':')[0]!;

  // Bare localhost or IP — no subdomain
  if (host === 'localhost' || host === '127.0.0.1') {
    return null;
  }

  const parts = host.split('.');

  // e.g. "acme.localhost" → ["acme", "localhost"]
  if (parts.length === 2 && parts[1] === 'localhost') {
    return parts[0] || null;
  }

  // e.g. "acme.example.com" → 3+ parts, first is subdomain
  if (parts.length >= 3) {
    return parts[0] || null;
  }

  // Single-segment hostname or two-segment domain (e.g. "example.com") — no subdomain
  return null;
}

/**
 * Resolves the tenant slug from a Fastify request using the following priority:
 * 1. `X-Tenant-Slug` header (explicit override)
 * 2. Subdomain extracted from the `Host` header
 * 3. Default value "default"
 */
export function resolveTenantSlug(request: FastifyRequest): string {
  // Priority 1: Explicit header
  const headerSlug = request.headers['x-tenant-slug'];
  if (headerSlug && typeof headerSlug === 'string' && headerSlug.trim().length > 0) {
    return headerSlug.trim();
  }

  // Priority 2: Subdomain from Host header
  const host = request.headers.host;
  if (host) {
    const subdomain = extractSubdomainSlug(host);
    if (subdomain) {
      return subdomain;
    }
  }

  // Priority 3: Default
  return 'default';
}
