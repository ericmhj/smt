/**
 * Property-Based Tests for Section Pattern Evaluators
 *
 * Tests correctness properties 4, 5, 6, and 7 from the design document.
 *
 * @module validation/__tests__/section-patterns.property.test
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { requiredAllEvaluator } from '../patterns/required-all.js';
import { numericRangeEvaluator } from '../patterns/numeric-range.js';
import { readonlyEvaluator } from '../patterns/readonly.js';
import { conditionalEvaluator } from '../patterns/conditional.js';
import type { PatternConfig } from '../validation.types.js';

// ─── Generators ──────────────────────────────────────────────────────────────

/** Generate a valid non-empty field name (alphanumeric + underscore, 1-30 chars) */
const fieldNameArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{0,29}$/);

/** Generate a set of unique field names (1-10 fields) */
const fieldNamesArb = fc.uniqueArray(fieldNameArb, { minLength: 1, maxLength: 10 });

/** Generate an empty value (null, undefined, or '') */
const emptyValueArb = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.constant(''),
);

/** Generate a non-empty value (including 0, false, non-empty strings, numbers) */
const nonEmptyValueArb = fc.oneof(
  fc.constant(0),
  fc.constant(false),
  fc.integer(),
  fc.double({ noNaN: true }),
  fc.string({ minLength: 1 }),
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

const baseConfig: PatternConfig = {
  sectionName: 'test_section',
  ruleName: 'test_rule',
  ruleType: 'global',
};

// ─── Property 4: required_all produces error for each empty field ────────────
// Feature: validation-rules-engine, Property 4: required_all produces error for each empty field
// **Validates: Requirements 6.2**

describe('Property 4: required_all produces error for each empty field', () => {
  it('produces exactly one error for each field with empty value', () => {
    fc.assert(
      fc.property(
        fieldNamesArb,
        fc.array(fc.boolean(), { minLength: 1, maxLength: 10 }),
        (fields, booleans) => {
          // Decide for each field whether it's empty or not
          const responses: Record<string, unknown> = {};
          const expectedEmptyFields: string[] = [];
          const expectedNonEmptyFields: string[] = [];

          fields.forEach((field, i) => {
            const isEmpty = booleans[i % booleans.length];
            if (isEmpty) {
              // Assign an empty value
              const emptyValues = [null, undefined, ''];
              responses[field] = emptyValues[i % 3];
              expectedEmptyFields.push(field);
            } else {
              // Assign a non-empty value
              responses[field] = `value_${i}`;
              expectedNonEmptyFields.push(field);
            }
          });

          const errors = requiredAllEvaluator(fields, responses, baseConfig);

          // For each empty field, exactly one error is produced with that fieldName
          for (const emptyField of expectedEmptyFields) {
            const fieldErrors = errors.filter(e => e.fieldName === emptyField);
            expect(fieldErrors).toHaveLength(1);
          }

          // For each non-empty field, no error is produced
          for (const nonEmptyField of expectedNonEmptyFields) {
            const fieldErrors = errors.filter(e => e.fieldName === nonEmptyField);
            expect(fieldErrors).toHaveLength(0);
          }

          // Total errors equals the number of empty fields
          expect(errors).toHaveLength(expectedEmptyFields.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('produces no errors when all fields have non-empty values (including 0 and false)', () => {
    fc.assert(
      fc.property(
        fieldNamesArb,
        (fields) => {
          const responses: Record<string, unknown> = {};
          const nonEmptyValues = [0, false, 'hello', 42, 3.14, 'x'];
          fields.forEach((field, i) => {
            responses[field] = nonEmptyValues[i % nonEmptyValues.length];
          });

          const errors = requiredAllEvaluator(fields, responses, baseConfig);
          expect(errors).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('produces an error for every field when all fields are empty', () => {
    fc.assert(
      fc.property(
        fieldNamesArb,
        fc.array(emptyValueArb, { minLength: 1, maxLength: 10 }),
        (fields, emptyValues) => {
          const responses: Record<string, unknown> = {};
          fields.forEach((field, i) => {
            responses[field] = emptyValues[i % emptyValues.length];
          });

          const errors = requiredAllEvaluator(fields, responses, baseConfig);
          expect(errors).toHaveLength(fields.length);

          for (const field of fields) {
            expect(errors.some(e => e.fieldName === field)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 5: numeric_range produces error for values outside [min, max] ──
// Feature: validation-rules-engine, Property 5: numeric_range produces error for values outside [min, max]
// **Validates: Requirements 6.3**

describe('Property 5: numeric_range produces error for values outside [min, max]', () => {
  it('produces error iff value < min OR value > max', () => {
    fc.assert(
      fc.property(
        fieldNameArb,
        fc.integer({ min: -10000, max: 10000 }),
        fc.integer({ min: -10000, max: 10000 }),
        fc.double({ min: -20000, max: 20000, noNaN: true, noDefaultInfinity: true }),
        (field, a, b, value) => {
          const min = Math.min(a, b);
          const max = Math.max(a, b);
          // Ensure min < max
          if (min >= max) return;

          const config: PatternConfig = {
            ...baseConfig,
            min,
            max,
          };

          const responses: Record<string, unknown> = { [field]: value };
          const errors = numericRangeEvaluator([field], responses, config);

          if (value < min || value > max) {
            expect(errors).toHaveLength(1);
            expect(errors[0].fieldName).toBe(field);
          } else {
            expect(errors).toHaveLength(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('produces no error for values within [min, max] inclusive', () => {
    fc.assert(
      fc.property(
        fieldNameArb,
        fc.integer({ min: -10000, max: 10000 }),
        fc.integer({ min: -10000, max: 10000 }),
        (field, a, b) => {
          const min = Math.min(a, b);
          const max = Math.max(a, b);
          if (min >= max) return;

          // Generate a value within [min, max]
          const value = min + Math.random() * (max - min);

          const config: PatternConfig = {
            ...baseConfig,
            min,
            max,
          };

          const responses: Record<string, unknown> = { [field]: value };
          const errors = numericRangeEvaluator([field], responses, config);
          expect(errors).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('produces error for values strictly below min', () => {
    fc.assert(
      fc.property(
        fieldNameArb,
        fc.integer({ min: 0, max: 10000 }),
        fc.integer({ min: 1, max: 10000 }),
        fc.nat(),
        (field, min, range, offset) => {
          const max = min + range;
          const value = min - 1 - (offset % 1000); // below min

          const config: PatternConfig = { ...baseConfig, min, max };
          const responses: Record<string, unknown> = { [field]: value };
          const errors = numericRangeEvaluator([field], responses, config);

          expect(errors).toHaveLength(1);
          expect(errors[0].fieldName).toBe(field);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('produces error for values strictly above max', () => {
    fc.assert(
      fc.property(
        fieldNameArb,
        fc.integer({ min: 0, max: 10000 }),
        fc.integer({ min: 1, max: 10000 }),
        fc.nat(),
        (field, min, range, offset) => {
          const max = min + range;
          const value = max + 1 + (offset % 1000); // above max

          const config: PatternConfig = { ...baseConfig, min, max };
          const responses: Record<string, unknown> = { [field]: value };
          const errors = numericRangeEvaluator([field], responses, config);

          expect(errors).toHaveLength(1);
          expect(errors[0].fieldName).toBe(field);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 6: readonly produces error for changed values ──────────────────
// Feature: validation-rules-engine, Property 6: readonly produces error for changed values
// **Validates: Requirements 6.4**

describe('Property 6: readonly produces error for changed values', () => {
  it('produces error iff String(responses[f] ?? "") !== String(previousResponses[f] ?? "")', () => {
    fc.assert(
      fc.property(
        fieldNamesArb,
        fc.array(
          fc.oneof(fc.string(), fc.integer(), fc.constant(null), fc.constant(undefined)),
          { minLength: 1, maxLength: 10 },
        ),
        fc.array(
          fc.oneof(fc.string(), fc.integer(), fc.constant(null), fc.constant(undefined)),
          { minLength: 1, maxLength: 10 },
        ),
        (fields, currentValues, previousValues) => {
          const responses: Record<string, unknown> = {};
          const previousResponses: Record<string, unknown> = {};

          fields.forEach((field, i) => {
            responses[field] = currentValues[i % currentValues.length];
            previousResponses[field] = previousValues[i % previousValues.length];
          });

          const errors = readonlyEvaluator(fields, responses, baseConfig, previousResponses);

          for (const field of fields) {
            const currentStr = String(responses[field] ?? '');
            const previousStr = String(previousResponses[field] ?? '');
            const fieldErrors = errors.filter(e => e.fieldName === field);

            if (currentStr !== previousStr) {
              expect(fieldErrors).toHaveLength(1);
            } else {
              expect(fieldErrors).toHaveLength(0);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('produces no errors when previousResponses is undefined', () => {
    fc.assert(
      fc.property(
        fieldNamesArb,
        fc.array(fc.oneof(fc.string(), fc.integer()), { minLength: 1, maxLength: 10 }),
        (fields, values) => {
          const responses: Record<string, unknown> = {};
          fields.forEach((field, i) => {
            responses[field] = values[i % values.length];
          });

          const errors = readonlyEvaluator(fields, responses, baseConfig, undefined);
          expect(errors).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('produces no errors when all values are identical to previous', () => {
    fc.assert(
      fc.property(
        fieldNamesArb,
        fc.array(fc.oneof(fc.string(), fc.integer()), { minLength: 1, maxLength: 10 }),
        (fields, values) => {
          const responses: Record<string, unknown> = {};
          const previousResponses: Record<string, unknown> = {};

          fields.forEach((field, i) => {
            const val = values[i % values.length];
            responses[field] = val;
            previousResponses[field] = val;
          });

          const errors = readonlyEvaluator(fields, responses, baseConfig, previousResponses);
          expect(errors).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 7: conditional applies thenPattern only when condition met ─────
// Feature: validation-rules-engine, Property 7: conditional applies thenPattern only when condition met
// **Validates: Requirements 6.5, 6.6**

describe('Property 7: conditional applies thenPattern only when condition met', () => {
  it('when condition is NOT met, returns empty array (identity)', () => {
    fc.assert(
      fc.property(
        fieldNameArb,
        fc.string({ minLength: 1, maxLength: 10 }),
        fc.string({ minLength: 1, maxLength: 10 }),
        fieldNamesArb,
        (dependsOnField, dependsOnValue, actualValue, fields) => {
          // Ensure condition is NOT met
          if (String(actualValue) === String(dependsOnValue)) return;

          const responses: Record<string, unknown> = {
            [dependsOnField]: actualValue,
          };
          // Add field values
          fields.forEach(f => {
            responses[f] = '';
          });

          const config: PatternConfig = {
            ...baseConfig,
            dependsOnField,
            dependsOnValue,
            thenPattern: 'required_all',
            thenPatternConfig: {},
          };

          const errors = conditionalEvaluator(fields, responses, config);
          expect(errors).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('when condition IS met, applies thenPattern (required_all)', () => {
    fc.assert(
      fc.property(
        fieldNameArb,
        fc.string({ minLength: 1, maxLength: 10 }),
        fieldNamesArb,
        (dependsOnField, dependsOnValue, fields) => {
          // Ensure dependsOnField is not in fields to avoid overlap
          const filteredFields = fields.filter(f => f !== dependsOnField);
          if (filteredFields.length === 0) return;

          // Condition IS met: responses[dependsOnField] === dependsOnValue
          const responses: Record<string, unknown> = {
            [dependsOnField]: dependsOnValue,
          };
          // All fields have empty values so required_all should flag them all
          filteredFields.forEach(f => {
            responses[f] = '';
          });

          const config: PatternConfig = {
            ...baseConfig,
            dependsOnField,
            dependsOnValue,
            thenPattern: 'required_all',
            thenPatternConfig: {},
          };

          const errors = conditionalEvaluator(filteredFields, responses, config);

          // required_all should produce one error per empty field
          expect(errors).toHaveLength(filteredFields.length);
          for (const field of filteredFields) {
            expect(errors.some(e => e.fieldName === field)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('when condition IS met and fields are non-empty, thenPattern (required_all) produces no errors', () => {
    fc.assert(
      fc.property(
        fieldNameArb,
        fc.string({ minLength: 1, maxLength: 10 }),
        fieldNamesArb,
        (dependsOnField, dependsOnValue, fields) => {
          const filteredFields = fields.filter(f => f !== dependsOnField);
          if (filteredFields.length === 0) return;

          const responses: Record<string, unknown> = {
            [dependsOnField]: dependsOnValue,
          };
          filteredFields.forEach((f, i) => {
            responses[f] = `value_${i}`;
          });

          const config: PatternConfig = {
            ...baseConfig,
            dependsOnField,
            dependsOnValue,
            thenPattern: 'required_all',
            thenPatternConfig: {},
          };

          const errors = conditionalEvaluator(filteredFields, responses, config);
          expect(errors).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
