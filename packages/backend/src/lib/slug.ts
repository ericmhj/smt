/**
 * Shared slug derivation utility.
 * Produces a consistent, valid slug from any tenant name string.
 *
 * Rules:
 * - Lowercase the input
 * - Replace non-alphanumeric characters with hyphens
 * - Collapse consecutive hyphens into one
 * - Strip leading and trailing hyphens
 * - Validate against the slug format regex
 * - Throw if the result is empty or invalid
 */

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$/;

/**
 * Derives a valid tenant slug from a nombre/name string.
 * @param nombre - The raw name to derive a slug from.
 * @returns A sanitized slug string.
 * @throws Error if the resulting slug is empty or does not match the valid slug format.
 */
export function deriveSlug(nombre: string): string {
  const slug = nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritical marks (accents)
    .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphens
    .replace(/-{2,}/g, '-') // Collapse consecutive hyphens
    .replace(/^-|-$/g, ''); // Strip leading/trailing hyphens

  if (!slug) {
    throw new Error('deriveSlug: el nombre produce un slug vacío');
  }

  if (!SLUG_REGEX.test(slug)) {
    throw new Error(
      `deriveSlug: el slug derivado '${slug}' no es válido. Debe contener entre 2-50 caracteres, solo letras minúsculas, números y guiones, sin comenzar ni terminar en guión.`,
    );
  }

  return slug;
}
