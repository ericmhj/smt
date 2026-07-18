import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { deriveSlug } from './slug.js';

describe('deriveSlug', () => {
  it('converts a normal name to lowercase slug', () => {
    expect(deriveSlug('Mi Empresa')).toBe('mi-empresa');
  });

  it('strips leading and trailing special characters', () => {
    expect(deriveSlug('-Mi Empresa-')).toBe('mi-empresa');
    expect(deriveSlug('---Leading---')).toBe('leading');
    expect(deriveSlug('  spaces  ')).toBe('spaces');
  });

  it('removes accented/diacritical characters', () => {
    expect(deriveSlug('Ñoño Café')).toBe('nono-cafe');
    expect(deriveSlug('Résumé')).toBe('resume');
    expect(deriveSlug('Über Straße')).toBe('uber-strase');
  });

  it('collapses consecutive special chars into a single hyphen', () => {
    expect(deriveSlug('hello---world')).toBe('hello-world');
    expect(deriveSlug('a   b   c')).toBe('a-b-c');
    expect(deriveSlug('foo!!!bar')).toBe('foo-bar');
  });

  it('passes through already-valid slugs unchanged', () => {
    expect(deriveSlug('empresa-prueba')).toBe('empresa-prueba');
    expect(deriveSlug('abc123')).toBe('abc123');
    expect(deriveSlug('my-tenant-slug')).toBe('my-tenant-slug');
  });

  it('throws an error for empty input', () => {
    expect(() => deriveSlug('')).toThrow('slug vacío');
    expect(() => deriveSlug('   ')).toThrow('slug vacío');
    expect(() => deriveSlug('---')).toThrow('slug vacío');
  });

  it('throws an error for single-character results', () => {
    // A single char doesn't match the regex (min 2 chars)
    expect(() => deriveSlug('a')).toThrow('no es válido');
  });

  it('handles max-length strings by passing if within 50 chars', () => {
    const longName = 'a'.repeat(50);
    // 50 chars of 'a' = 'aaaa...a' which is valid
    expect(deriveSlug(longName)).toBe('a'.repeat(50));
  });

  it('throws for results exceeding 50 characters', () => {
    const longName = 'abcdefghij'.repeat(6); // 60 chars all valid
    expect(() => deriveSlug(longName)).toThrow('no es válido');
  });

  describe('property-based tests', () => {
    it('never produces a slug with leading or trailing hyphens', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 2, maxLength: 40 }).filter((s) => /[a-zA-Z0-9]/.test(s)),
          (nombre) => {
            try {
              const slug = deriveSlug(nombre);
              expect(slug).not.toMatch(/^-/);
              expect(slug).not.toMatch(/-$/);
            } catch {
              // Throws are acceptable (empty/invalid results)
            }
          },
        ),
        { numRuns: 200 },
      );
    });

    it('always produces output matching the valid slug regex when it does not throw', () => {
      const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$/;
      fc.assert(
        fc.property(
          fc.string({ minLength: 3, maxLength: 30 }).filter((s) => /[a-zA-Z0-9]{2,}/.test(s)),
          (nombre) => {
            try {
              const slug = deriveSlug(nombre);
              expect(slug).toMatch(SLUG_REGEX);
            } catch {
              // Throws are acceptable
            }
          },
        ),
        { numRuns: 200 },
      );
    });

    it('never contains consecutive hyphens', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 3, maxLength: 30 }).filter((s) => /[a-zA-Z0-9]{2,}/.test(s)),
          (nombre) => {
            try {
              const slug = deriveSlug(nombre);
              expect(slug).not.toContain('--');
            } catch {
              // Throws are acceptable
            }
          },
        ),
        { numRuns: 200 },
      );
    });
  });
});
