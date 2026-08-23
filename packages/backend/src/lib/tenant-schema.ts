/**
 * Utility to safely derive a PostgreSQL schema name from a tenant slug.
 * Validates the slug strictly to prevent SQL injection when interpolating
 * schema names into queries (schema names cannot be parameterized in SQL).
 */

const VALID_SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$/;
const VALID_SCHEMA_REGEX = /^sgr_[a-z0-9][a-z0-9_]{0,48}[a-z0-9]$/;

/**
 * Validates that a tenant slug is safe for use in SQL schema name derivation.
 * Throws if the slug contains unexpected characters.
 */
export function validateSlug(slug: string): void {
  if (!slug || !VALID_SLUG_REGEX.test(slug)) {
    throw new Error(`Invalid tenant slug: "${slug}". Must match /^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$/`);
  }
}

/**
 * Derives a safe PostgreSQL schema name from a tenant slug.
 * Validates the slug, replaces hyphens with underscores, and prefixes with "sgr_".
 *
 * @throws Error if the slug is invalid
 */
export function toSchemaName(slug: string): string {
  validateSlug(slug);
  const schema = `sgr_${slug.replace(/-/g, '_')}`;
  if (!VALID_SCHEMA_REGEX.test(schema)) {
    throw new Error(`Derived schema name invalid: "${schema}"`);
  }
  return schema;
}

/**
 * Sanitizes a value for safe inclusion in a SQL string literal.
 * This is a last resort — prefer parameterized queries ($1, $2) whenever possible.
 * Escapes single quotes by doubling them and rejects null bytes.
 */
export function escapeSqlString(value: string): string {
  if (value.includes('\0')) {
    throw new Error('SQL value cannot contain null bytes');
  }
  return value.replace(/'/g, "''");
}

/**
 * Sanitizes a filename for use in storage paths.
 * Removes path traversal, null bytes, and non-safe characters.
 */
export function sanitizeFilename(originalName: string): string {
  return originalName
    .replace(/\0/g, '')           // Remove null bytes
    .replace(/\.\./g, '')         // Remove path traversal
    .replace(/[/\\]/g, '')        // Remove slashes
    .replace(/[^a-zA-Z0-9._-]/g, '_') // Replace unsafe chars with underscore
    .slice(0, 200);              // Truncate length
}
