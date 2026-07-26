import { describe, it, expect, vi } from 'vitest';
import type { FormField } from './validation-engine';
import type { EffectiveRule } from './validation.types';

/**
 * Unit tests for the validate function in ValidationEngine.
 *
 * These tests mock computeEffectiveRuleSet to isolate the validate orchestration logic.
 * They verify: graceful degradation, identity on empty rules, section pattern evaluation,
 * field override priority, and error collection.
 */

// We dynamically import the module so we can mock computeEffectiveRuleSet
vi.mock('./validation-engine.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./validation-engine.js')>();
  return {
    ...original,
  };
});

describe('validate function', () => {
  const mockDb = {} as any;
  const formId = 'test-form-id';
  const formType = 'nom025';

  const fieldsMetadata: FormField[] = [
    {
      sectionName: 'identificacion',
      fields: ['empresa_nombre', 'centro_rfc', 'responsable_nombre'],
    },
    {
      sectionName: 'mediciones',
      fields: ['lux_medido', 'lux_referencia'],
    },
  ];

  // Helper to create a mock validate function that uses provided effective rules
  // instead of calling the DB
  async function validateWithRules(
    effectiveRules: EffectiveRule[],
    responses: Record<string, unknown>,
    metadata: FormField[] = fieldsMetadata,
    previousResponses?: Record<string, unknown>,
  ) {
    // We import the module fresh each time and mock computeEffectiveRuleSet
    const engineModule = await import('./validation-engine.js');

    // Mock computeEffectiveRuleSet at module level
    const originalCompute = engineModule.computeEffectiveRuleSet;
    (engineModule as any).computeEffectiveRuleSet = vi.fn().mockResolvedValue(effectiveRules);

    // Since the validate function calls computeEffectiveRuleSet internally,
    // we need a different approach — let's test the orchestration logic directly
    // by calling validate with a mock db that returns the right data
    // Restore
    (engineModule as any).computeEffectiveRuleSet = originalCompute;

    // Instead, let's use the actual function with a mock db
    return engineModule.validate(mockDb, formId, formType, responses, metadata, previousResponses);
  }

  describe('graceful degradation', () => {
    it('should return valid=true when computeEffectiveRuleSet throws (DB failure)', async () => {
      // Import the real module
      const { validate } = await import('./validation-engine.js');

      // Mock db that throws on any query
      const failingDb = {
        select: () => ({
          from: () => ({
            where: () => { throw new Error('DB connection failed'); },
          }),
        }),
      } as any;

      const result = await validate(
        failingDb,
        formId,
        formType,
        { empresa_nombre: 'Test' },
        fieldsMetadata,
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('identity when no rules', () => {
    it('should return valid=true when effective rule set is empty', async () => {
      const { validate } = await import('./validation-engine.js');

      // Mock db that returns empty arrays for both queries
      const emptyDb = {
        select: () => ({
          from: () => ({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as any;

      const result = await validate(
        emptyDb,
        formId,
        formType,
        {}, // empty responses — should still pass
        fieldsMetadata,
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('section pattern evaluation', () => {
    it('should collect errors from required_all pattern for empty fields', async () => {
      const { validate } = await import('./validation-engine.js');

      // Mock db that returns a rule with required_all pattern
      let callCount = 0;
      const mockDbWithRules = {
        select: () => ({
          from: () => ({
            where: vi.fn().mockImplementation(() => {
              callCount++;
              if (callCount === 1) {
                // First call: global rules
                return Promise.resolve([
                  {
                    id: 'rule-1',
                    formType: 'nom025',
                    name: 'Campos obligatorios',
                    isActive: true,
                    sections: [
                      {
                        sectionName: 'identificacion',
                        pattern: 'required_all',
                        patternConfig: {},
                        fieldOverrides: [],
                      },
                    ],
                  },
                ]);
              }
              // Second call: overrides (none)
              return Promise.resolve([]);
            }),
          }),
        }),
      } as any;

      const result = await validate(
        mockDbWithRules,
        formId,
        formType,
        { empresa_nombre: '', centro_rfc: 'ABC123', responsable_nombre: null },
        fieldsMetadata,
      );

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(2); // empresa_nombre (empty) + responsable_nombre (null)
      expect(result.errors.map((e) => e.fieldName)).toContain('empresa_nombre');
      expect(result.errors.map((e) => e.fieldName)).toContain('responsable_nombre');
    });
  });

  describe('field override priority', () => {
    it('should apply field override instead of section pattern for overridden fields', async () => {
      const { validate } = await import('./validation-engine.js');

      let callCount = 0;
      const mockDbWithRules = {
        select: () => ({
          from: () => ({
            where: vi.fn().mockImplementation(() => {
              callCount++;
              if (callCount === 1) {
                return Promise.resolve([
                  {
                    id: 'rule-1',
                    formType: 'nom025',
                    name: 'Mixed rule',
                    isActive: true,
                    sections: [
                      {
                        sectionName: 'identificacion',
                        pattern: 'required_all',
                        patternConfig: {},
                        fieldOverrides: [
                          {
                            fieldName: 'centro_rfc',
                            transferFunction: 'identity', // skip validation for this field
                            config: {},
                          },
                        ],
                      },
                    ],
                  },
                ]);
              }
              return Promise.resolve([]);
            }),
          }),
        }),
      } as any;

      // centro_rfc is empty but has identity override, so no error for it
      // empresa_nombre is empty and has no override, so required_all produces error
      const result = await validate(
        mockDbWithRules,
        formId,
        formType,
        { empresa_nombre: '', centro_rfc: '', responsable_nombre: 'John' },
        fieldsMetadata,
      );

      expect(result.valid).toBe(false);
      // Only empresa_nombre should fail (centro_rfc has identity override, responsable_nombre has value)
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].fieldName).toBe('empresa_nombre');
    });
  });

  describe('missing section handling', () => {
    it('should skip sections not found in fieldsMetadata', async () => {
      const { validate } = await import('./validation-engine.js');

      let callCount = 0;
      const mockDbWithRules = {
        select: () => ({
          from: () => ({
            where: vi.fn().mockImplementation(() => {
              callCount++;
              if (callCount === 1) {
                return Promise.resolve([
                  {
                    id: 'rule-1',
                    formType: 'nom025',
                    name: 'Rule with unknown section',
                    isActive: true,
                    sections: [
                      {
                        sectionName: 'nonexistent_section',
                        pattern: 'required_all',
                        patternConfig: {},
                        fieldOverrides: [],
                      },
                    ],
                  },
                ]);
              }
              return Promise.resolve([]);
            }),
          }),
        }),
      } as any;

      const result = await validate(
        mockDbWithRules,
        formId,
        formType,
        {},
        fieldsMetadata,
      );

      // No errors because the section doesn't exist in metadata — skipped
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('error enrichment', () => {
    it('should include sectionName, ruleName, and ruleType in errors', async () => {
      const { validate } = await import('./validation-engine.js');

      let callCount = 0;
      const mockDbWithRules = {
        select: () => ({
          from: () => ({
            where: vi.fn().mockImplementation(() => {
              callCount++;
              if (callCount === 1) {
                return Promise.resolve([
                  {
                    id: 'rule-1',
                    formType: 'nom025',
                    name: 'Campos obligatorios',
                    isActive: true,
                    sections: [
                      {
                        sectionName: 'identificacion',
                        pattern: 'required_all',
                        patternConfig: {},
                        fieldOverrides: [],
                      },
                    ],
                  },
                ]);
              }
              return Promise.resolve([]);
            }),
          }),
        }),
      } as any;

      const result = await validate(
        mockDbWithRules,
        formId,
        formType,
        { empresa_nombre: '', centro_rfc: 'valid', responsable_nombre: 'valid' },
        fieldsMetadata,
      );

      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toEqual({
        fieldName: 'empresa_nombre',
        sectionName: 'identificacion',
        ruleName: 'Campos obligatorios',
        message: 'El campo es obligatorio',
        ruleType: 'global',
      });
    });
  });
});
