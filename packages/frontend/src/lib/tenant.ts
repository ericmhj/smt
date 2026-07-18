/**
 * Extracts the tenant slug from a hostname string.
 *
 * Resolution rules:
 *   - "{slug}.localhost" → slug
 *   - "{slug}.domain.tld" → slug (3+ segments)
 *   - "localhost" or "127.0.0.1" → "default"
 *   - Any other bare hostname (no subdomain) → "default"
 *
 * Handles SSR gracefully: if no hostname is provided and `window` is not
 * available, returns "default".
 */
export function extractTenantSlug(hostname?: string): string {
  const host = hostname ?? getWindowHostname();

  if (!host) return 'default';

  // Strip port if present (e.g. "acme.localhost:3000")
  const bare = host.split(':')[0]!;

  // Bare localhost or loopback IP — no subdomain
  if (bare === 'localhost' || bare === '127.0.0.1') {
    return 'default';
  }

  const parts = bare.split('.');

  // e.g. "acme.localhost" → ["acme", "localhost"]
  if (parts.length === 2 && parts[1] === 'localhost') {
    return parts[0] || 'default';
  }

  // e.g. "acme.example.com" → 3+ parts, first segment is the slug
  if (parts.length >= 3) {
    return parts[0] || 'default';
  }

  // Single segment or two-segment domain without localhost (e.g. "example.com")
  return 'default';
}

/**
 * Safely reads window.location.hostname, returning null during SSR.
 */
function getWindowHostname(): string | null {
  if (typeof window === 'undefined') return null;
  return window.location.hostname;
}
