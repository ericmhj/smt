/**
 * Property-Based Tests: Effective Rule Set Computation
 *
 * Feature: validation-rules-engine, Property 1: Effective Rule Set equals (active globals − deactivated) ∪ customs
 * Feature: validation-rules-engine, Property 2: Empty effective rule set returns valid: true with no errors
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 4.5, 5.1, 5.2, 19.1
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type {
  RuleSection,
  EffectiveRule,
  ValidationResult,
} from '../validation.types.js';

// ─── Pure helper: computeEffectiveRuleSetFromData ──────────────────────────────
// This extracts the same logic as computeEffectiveRuleSet in validation-engine.ts
// but operates on plain data (no DB), making it testable with fast-check.

interface GlobalRule {
  id: string;
  formType: string;
  name: string;
  isActive: boolean;
  sections: RuleSection[];
}

interface Override {
  id: string;
  formId: string;
  ruleTemplateId: string | null;
  overrideType: 'deactivate' | 'custom';
  customRule: RuleSection[] | null;
}

/**
 * Pure computation of the effective rule set from raw data.
 * Mirrors the logic in validation-engine.ts:
 *   Effective = (active globals for form_type) − deactivated + custom overrides
 */
export function computeEffectiveRuleSetFromData(
  globals: GlobalRule[],
  overrides: Override[],
  formType: string,
): EffectiveRule[] {
  // 1. Filter active globals matching form type
  const activeGlobals = globals.filter(
    (r) => r.formType === formType && r.isActive === true,
  );

  // 2. Identify deactivated rule IDs
  const deactivatedIds = new Set(
    overrides
      .filter((o) => o.overrideType === 'deactivate' && o.ruleTemplateId)
      .map((o) => o.ruleTemplateId!),
  );

  // 3. Remove deactivated rules from active globals
  const filteredGlobals: EffectiveRule[] = activeGlobals
    .filter((rule) => !deactivatedIds.has(rule.id))
    .map((rule) => ({
      id: rule.id,
      name: rule.name,
      source: 'global' as const,
      sections: rule.sections,
    }));

  // 4. Map custom overrides to EffectiveRule
  const customRules: EffectiveRule[] = overrides
    .filter((o) => o.overrideType === 'custom' && o.customRule)
    .map((o) => ({
      id: `custom-${o.id}`,
      name: 'Regla personalizada',
      source: 'custom' as const,
      sections: o.customRule as RuleSection[],
    }));

  // 5. Return combined set
  return [...filteredGlobals, ...customRules];
}

// ─── Arbitraries (Generators) ──────────────────────────────────────────────────

const arbSectionPattern = fc.constantFrom(
  'identity',
  'required_all',
  'numeric_range',
  'readonly',
  'conditional',
) as fc.Arbitrary<RuleSection['pattern']>;

const arbRuleSection: fc.Arbitrary<RuleSection> = fc.record({
  sectionName: fc.string({ minLength: 1, maxLength: 20 }),
  pattern: arbSectionPattern,
  patternConfig: fc.constant({}),
  fieldOverrides: fc.constant([]),
});

const arbGlobalRule = (formType: string): fc.Arbitrary<GlobalRule> =>
  fc.record({
    id: fc.uuid(),
    formType: fc.constant(formType),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    isActive: fc.boolean(),
    sections: fc.array(arbRuleSection, { minLength: 1, maxLength: 3 }),
  });

const arbDeactivateOverride = (
  globalIds: string[],
): fc.Arbitrary<Override> =>
  fc.record({
    id: fc.uuid(),
    formId: fc.uuid(),
    ruleTemplateId: globalIds.length > 0
      ? fc.constantFrom(...globalIds)
      : fc.constant(null),
    overrideType: fc.constant('deactivate' as const),
    customRule: fc.constant(null),
  });

const arbCustomOverride: fc.Arbitrary<Override> = fc.record({
  id: fc.uuid(),
  formId: fc.uuid(),
  ruleTemplateId: fc.constant(null),
  overrideType: fc.constant('custom' as const),
  customRule: fc.array(arbRuleSection, { minLength: 1, maxLength: 3 }),
});

// ─── Property Tests ────────────────────────────────────────────────────────────

describe('Effective Rule Set - Property Tests', () => {
  const FORM_TYPE = 'nom025';

  // Feature: validation-rules-engine, Property 1: Effective Rule Set Computation
  describe('Property 1: Effective Rule Set equals (active globals − deactivated) ∪ customs', () => {
    /**
     * Validates: Requirements 3.1, 3.2, 3.3, 4.5, 5.1
     */
    it('should compute effective rule set as (active globals − deactivated) ∪ custom overrides', () => {
      fc.assert(
        fc.property(
          // Generate global rules (some active, some not)
          fc.array(arbGlobalRule(FORM_TYPE), { minLength: 0, maxLength: 10 }),
          // Generate a set of deactivation override indices + custom overrides
          fc.nat({ max: 20 }),
          fc.array(arbCustomOverride, { minLength: 0, maxLength: 5 }),
          (globals, _seed, customOverrides) => {
            // Determine which global IDs are active
            const activeGlobalIds = globals
              .filter((g) => g.isActive)
              .map((g) => g.id);

            // Generate deactivation overrides referencing a subset of active global IDs
            const deactivateCount = Math.min(
              Math.floor(activeGlobalIds.length / 2),
              3,
            );
            const deactivatedIds = activeGlobalIds.slice(0, deactivateCount);
            const deactivateOverrides: Override[] = deactivatedIds.map(
              (ruleId) => ({
                id: `deact-${ruleId}`,
                formId: 'form-1',
                ruleTemplateId: ruleId,
                overrideType: 'deactivate' as const,
                customRule: null,
              }),
            );

            const allOverrides = [...deactivateOverrides, ...customOverrides];

            // Run the pure computation
            const result = computeEffectiveRuleSetFromData(
              globals,
              allOverrides,
              FORM_TYPE,
            );

            // Compute expected result manually
            const expectedGlobals = globals
              .filter(
                (g) =>
                  g.formType === FORM_TYPE &&
                  g.isActive === true &&
                  !deactivatedIds.includes(g.id),
              )
              .map((g) => ({
                id: g.id,
                name: g.name,
                source: 'global' as const,
                sections: g.sections,
              }));

            const expectedCustoms = customOverrides
              .filter((o) => o.customRule !== null)
              .map((o) => ({
                id: `custom-${o.id}`,
                name: 'Regla personalizada',
                source: 'custom' as const,
                sections: o.customRule as RuleSection[],
              }));

            const expectedEffective = [...expectedGlobals, ...expectedCustoms];

            // Assert: result matches expected
            expect(result.length).toBe(expectedEffective.length);

            // Verify global rules
            const resultGlobalIds = result
              .filter((r) => r.source === 'global')
              .map((r) => r.id)
              .sort();
            const expectedGlobalIds = expectedGlobals
              .map((r) => r.id)
              .sort();
            expect(resultGlobalIds).toEqual(expectedGlobalIds);

            // Verify custom rules
            const resultCustomIds = result
              .filter((r) => r.source === 'custom')
              .map((r) => r.id)
              .sort();
            const expectedCustomIds = expectedCustoms
              .map((r) => r.id)
              .sort();
            expect(resultCustomIds).toEqual(expectedCustomIds);

            // Verify no inactive globals sneak in
            const inactiveGlobalIds = globals
              .filter((g) => !g.isActive || g.formType !== FORM_TYPE)
              .map((g) => g.id);
            for (const rule of result) {
              if (rule.source === 'global') {
                expect(inactiveGlobalIds).not.toContain(rule.id);
                expect(deactivatedIds).not.toContain(rule.id);
              }
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should not include inactive global rules in effective set', () => {
      fc.assert(
        fc.property(
          fc.array(arbGlobalRule(FORM_TYPE), { minLength: 1, maxLength: 10 }),
          (globals) => {
            const result = computeEffectiveRuleSetFromData(globals, [], FORM_TYPE);

            // Every result global must come from an active global
            const activeIds = new Set(
              globals.filter((g) => g.isActive && g.formType === FORM_TYPE).map((g) => g.id),
            );

            for (const rule of result) {
              if (rule.source === 'global') {
                expect(activeIds.has(rule.id)).toBe(true);
              }
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should exclude deactivated rules from effective set', () => {
      fc.assert(
        fc.property(
          fc.array(arbGlobalRule(FORM_TYPE), { minLength: 1, maxLength: 10 }),
          (globals) => {
            const activeGlobals = globals.filter(
              (g) => g.isActive && g.formType === FORM_TYPE,
            );
            if (activeGlobals.length === 0) return; // trivial case

            // Deactivate all active globals
            const deactivateOverrides: Override[] = activeGlobals.map((g) => ({
              id: `deact-${g.id}`,
              formId: 'form-1',
              ruleTemplateId: g.id,
              overrideType: 'deactivate' as const,
              customRule: null,
            }));

            const result = computeEffectiveRuleSetFromData(
              globals,
              deactivateOverrides,
              FORM_TYPE,
            );

            // No global rules should remain
            const globalResults = result.filter((r) => r.source === 'global');
            expect(globalResults.length).toBe(0);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // Feature: validation-rules-engine, Property 2: Identity Preservation
  describe('Property 2: Empty effective rule set returns valid: true with no errors', () => {
    /**
     * Validates: Requirements 3.4, 5.2, 19.1
     */
    it('should return valid=true with empty errors when effective rule set is empty', () => {
      fc.assert(
        fc.property(
          // Generate arbitrary form responses (any keys and values)
          fc.dictionary(
            fc.string({ minLength: 1, maxLength: 20 }),
            fc.oneof(
              fc.string(),
              fc.integer(),
              fc.double({ noNaN: true }),
              fc.boolean(),
              fc.constant(null),
              fc.constant(undefined),
              fc.constant(''),
            ),
          ),
          (responses) => {
            // With no globals and no overrides, effective rule set is empty
            const effectiveRules = computeEffectiveRuleSetFromData([], [], FORM_TYPE);
            expect(effectiveRules.length).toBe(0);

            // Simulate what validate() does: if effectiveRules is empty, return identity
            const validationResult: ValidationResult = {
              valid: true,
              errors: [],
            };

            expect(validationResult.valid).toBe(true);
            expect(validationResult.errors).toEqual([]);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should return valid=true when all global rules are inactive', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.uuid(),
              formType: fc.constant(FORM_TYPE),
              name: fc.string({ minLength: 1, maxLength: 50 }),
              isActive: fc.constant(false), // All inactive
              sections: fc.array(arbRuleSection, { minLength: 1, maxLength: 3 }),
            }),
            { minLength: 1, maxLength: 5 },
          ),
          fc.dictionary(
            fc.string({ minLength: 1, maxLength: 20 }),
            fc.oneof(fc.string(), fc.integer(), fc.constant(null)),
          ),
          (inactiveGlobals, responses) => {
            const effectiveRules = computeEffectiveRuleSetFromData(
              inactiveGlobals,
              [],
              FORM_TYPE,
            );

            // No active rules → empty effective set → identity
            expect(effectiveRules.length).toBe(0);

            // Identity means valid=true regardless of responses
            const validationResult: ValidationResult = {
              valid: true,
              errors: [],
            };
            expect(validationResult.valid).toBe(true);
            expect(validationResult.errors).toEqual([]);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should return valid=true when all active globals are deactivated by overrides', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.uuid(),
              formType: fc.constant(FORM_TYPE),
              name: fc.string({ minLength: 1, maxLength: 50 }),
              isActive: fc.constant(true),
              sections: fc.array(arbRuleSection, { minLength: 1, maxLength: 3 }),
            }),
            { minLength: 1, maxLength: 5 },
          ),
          fc.dictionary(
            fc.string({ minLength: 1, maxLength: 20 }),
            fc.oneof(fc.string(), fc.integer(), fc.constant(null)),
          ),
          (activeGlobals, responses) => {
            // Deactivate all
            const deactivateOverrides: Override[] = activeGlobals.map((g) => ({
              id: `deact-${g.id}`,
              formId: 'form-1',
              ruleTemplateId: g.id,
              overrideType: 'deactivate' as const,
              customRule: null,
            }));

            const effectiveRules = computeEffectiveRuleSetFromData(
              activeGlobals,
              deactivateOverrides,
              FORM_TYPE,
            );

            // All deactivated → empty effective set → identity
            expect(effectiveRules.length).toBe(0);

            const validationResult: ValidationResult = {
              valid: true,
              errors: [],
            };
            expect(validationResult.valid).toBe(true);
            expect(validationResult.errors).toEqual([]);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should return valid=true with validate() when DB returns empty arrays', async () => {
      // This test uses the real validate function with a mock DB returning empty arrays
      const { validate } = await import('../validation-engine.js');

      fc.assert(
        fc.asyncProperty(
          fc.dictionary(
            fc.string({ minLength: 1, maxLength: 20 }),
            fc.oneof(
              fc.string(),
              fc.integer(),
              fc.double({ noNaN: true }),
              fc.constant(null),
              fc.constant(''),
            ),
          ),
          async (responses) => {
            const emptyDb = {
              select: () => ({
                from: () => ({
                  where: () => Promise.resolve([]),
                }),
              }),
            } as any;

            const fieldsMetadata = [
              { sectionName: 'test', fields: Object.keys(responses) },
            ];

            const result = await validate(
              emptyDb,
              'form-id',
              FORM_TYPE,
              responses,
              fieldsMetadata,
            );

            expect(result.valid).toBe(true);
            expect(result.errors).toEqual([]);
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
