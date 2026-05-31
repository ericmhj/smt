import fc from 'fast-check';
import type { Role, ReactivoState } from '../src/types/index.js';

/**
 * Shared fast-check arbitraries for property-based testing across the monorepo.
 */
export const arbitraries = {
  /** Generates a random valid role */
  role(): fc.Arbitrary<Role> {
    return fc.constantFrom<Role>(
      'superusuario',
      'administrador',
      'manager',
      'tecnico_de_campo',
    );
  },

  /** Generates a random valid reactivo state */
  reactivoState(): fc.Arbitrary<ReactivoState> {
    return fc.constantFrom<ReactivoState>(
      'pendiente',
      'en_revision',
      'validado',
      'rechazado',
      'finalizado',
    );
  },

  /** Generates a valid email address */
  email(): fc.Arbitrary<string> {
    return fc
      .tuple(
        fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'), {
          minLength: 3,
          maxLength: 15,
        }),
        fc.constantFrom('example.com', 'test.org', 'sgr.local'),
      )
      .map(([local, domain]) => `${local}@${domain}`);
  },

  /** Generates a valid UUID v4 */
  uuid(): fc.Arbitrary<string> {
    return fc.uuid();
  },

  /** Generates a valid attempt number (positive integer) */
  attemptNumber(): fc.Arbitrary<number> {
    return fc.integer({ min: 1, max: 100 });
  },

  /** Generates a non-empty string suitable for text fields */
  nonEmptyText(maxLength = 500): fc.Arbitrary<string> {
    return fc.string({ minLength: 1, maxLength });
  },
};
