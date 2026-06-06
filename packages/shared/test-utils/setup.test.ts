import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { arbitraries } from './arbitraries.js';

describe('Test Framework Setup', () => {
  it('vitest is configured correctly', () => {
    expect(true).toBe(true);
  });

  it('fast-check is configured correctly', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => {
        return a + b === b + a;
      }),
      { numRuns: 100 },
    );
  });

  it('shared arbitraries generate valid roles', () => {
    fc.assert(
      fc.property(arbitraries.role(), (role) => {
        const validRoles = ['superusuario', 'admin', 'manager', 'tecnico', 'asistente'];
        return validRoles.includes(role);
      }),
      { numRuns: 100 },
    );
  });

  it('shared arbitraries generate valid reactivo states', () => {
    fc.assert(
      fc.property(arbitraries.reactivoState(), (state) => {
        const validStates = ['pendiente', 'en_revision', 'validado', 'rechazado', 'finalizado'];
        return validStates.includes(state);
      }),
      { numRuns: 100 },
    );
  });

  it('shared arbitraries generate valid emails', () => {
    fc.assert(
      fc.property(arbitraries.email(), (email) => {
        return email.includes('@') && email.length > 5;
      }),
      { numRuns: 100 },
    );
  });
});
