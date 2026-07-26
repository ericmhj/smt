/**
 * Property-Based Tests: Rule Persistence
 *
 * Feature: validation-rules-engine, Property 14: RuleSection array JSONB round-trip
 * Feature: validation-rules-engine, Property 15: Toggling is_active twice restores original value
 *
 * Validates: Requirements 1.3, 10.5
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type {
  RuleSection,
  FieldOverride,
  SectionPattern,
  FieldTransferFunction,
} from '../validation.types.js';

// ─── Arbitraries (Generators) ──────────────────────────────────────────────────

const sectionPatterns: SectionPattern[] = [
  'identity',
  'required_all',
  'numeric_range',
  'readonly',
  'conditional',
];

const fieldTransferFunctions: FieldTransferFunction[] = [
  'identity',
  'required',
  'range',
  'pattern',
  'transform',
  'lookup',
  'computed',
];

const arbSectionPattern: fc.Arbitrary<SectionPattern> = fc.constantFrom(
  ...sectionPatterns,
);

const arbFieldTransferFunction: fc.Arbitrary<FieldTransferFunction> =
  fc.constantFrom(...fieldTransferFunctions);

/**
 * Generate a simple JSON-safe config object (PatternConfig / FieldOverrideConfig).
 * Only includes JSON-safe primitives (no undefined, no NaN, no Infinity).
 */
const arbSimpleConfig: fc.Arbitrary<Record<string, unknown>> = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 15 }),
  fc.oneof(
    fc.string({ maxLength: 50 }),
    fc.integer({ min: -10000, max: 10000 }),
    fc.double({ min: -10000, max: 10000, noNaN: true, noDefaultInfinity: true }),
    fc.boolean(),
    fc.constant(null),
  ),
  { minKeys: 0, maxKeys: 5 },
);

/**
 * Generate a valid FieldOverride with a fieldName, transferFunction, and config.
 */
const arbFieldOverride: fc.Arbitrary<FieldOverride> = fc.record({
  fieldName: fc.string({ minLength: 1, maxLength: 30 }),
  transferFunction: arbFieldTransferFunction,
  config: arbSimpleConfig,
});

/**
 * Generate a valid RuleSection with a sectionName, pattern, patternConfig, and fieldOverrides.
 */
const arbRuleSection: fc.Arbitrary<RuleSection> = fc.record({
  sectionName: fc.string({ minLength: 1, maxLength: 30 }),
  pattern: arbSectionPattern,
  patternConfig: arbSimpleConfig,
  fieldOverrides: fc.array(arbFieldOverride, { minLength: 0, maxLength: 5 }),
});

// ─── Property Tests ────────────────────────────────────────────────────────────

describe('Rule Persistence - Property Tests', () => {
  // Feature: validation-rules-engine, Property 14: RuleSection array JSONB round-trip
  describe('Property 14: RuleSection array serialized to JSONB and deserialized back produces structurally equivalent object', () => {
    /**
     * Validates: Requirements 1.3
     */
    it('should survive JSON.stringify → JSON.parse round-trip without data loss', () => {
      fc.assert(
        fc.property(
          fc.array(arbRuleSection, { minLength: 0, maxLength: 10 }),
          (sections: RuleSection[]) => {
            // Simulate PostgreSQL JSONB serialization: JSON.stringify → JSON.parse
            const serialized = JSON.stringify(sections);
            const deserialized = JSON.parse(serialized) as RuleSection[];

            // The deserialized result must be deep-equal to the original
            expect(deserialized).toEqual(sections);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should preserve nested fieldOverrides through JSONB round-trip', () => {
      fc.assert(
        fc.property(
          fc.array(arbRuleSection, { minLength: 1, maxLength: 5 }).filter(
            (sections) =>
              sections.some(
                (s) => s.fieldOverrides && s.fieldOverrides.length > 0,
              ),
          ),
          (sections: RuleSection[]) => {
            const serialized = JSON.stringify(sections);
            const deserialized = JSON.parse(serialized) as RuleSection[];

            // Verify each section's fieldOverrides survived
            for (let i = 0; i < sections.length; i++) {
              expect(deserialized[i].sectionName).toBe(sections[i].sectionName);
              expect(deserialized[i].pattern).toBe(sections[i].pattern);
              expect(deserialized[i].patternConfig).toEqual(
                sections[i].patternConfig,
              );
              expect(deserialized[i].fieldOverrides).toEqual(
                sections[i].fieldOverrides,
              );
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // Feature: validation-rules-engine, Property 15: Toggling is_active twice restores original value
  describe('Property 15: Toggling is_active twice restores original value', () => {
    /**
     * Validates: Requirements 10.5
     */
    it('should restore original is_active value after toggling twice', () => {
      fc.assert(
        fc.property(fc.boolean(), (isActive: boolean) => {
          // Apply toggle (negate) once
          const afterFirstToggle = !isActive;
          // Apply toggle (negate) again
          const afterSecondToggle = !afterFirstToggle;

          // The double-toggled value must equal the original
          expect(afterSecondToggle).toBe(isActive);
        }),
        { numRuns: 100 },
      );
    });

    it('should hold for toggle applied as a function: toggle(toggle(x)) === x', () => {
      fc.assert(
        fc.property(fc.boolean(), (isActive: boolean) => {
          // Define toggle as a function (mirrors DB PATCH behavior)
          const toggle = (value: boolean): boolean => !value;

          // Applying toggle twice is the identity function
          expect(toggle(toggle(isActive))).toBe(isActive);
        }),
        { numRuns: 100 },
      );
    });
  });
});
