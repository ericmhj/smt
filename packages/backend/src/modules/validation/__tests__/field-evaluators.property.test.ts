/**
 * Property-Based Tests for Field Evaluators
 *
 * Tests Properties 8–12 from the design document:
 * - Property 8: Field override priority over section pattern
 * - Property 9: range evaluator produces error iff v < min OR v > max
 * - Property 10: pattern evaluator produces error iff regex does not match
 * - Property 11: transform/computed tolerance check
 * - Property 12: lookup produces error iff value not in allowedValues
 *
 * **Validates: Requirements 7.1, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { fieldIdentityEvaluator } from '../patterns/field-identity.js';
import { fieldRangeEvaluator } from '../patterns/field-range.js';
import { fieldPatternEvaluator } from '../patterns/field-pattern.js';
import { fieldTransformEvaluator } from '../patterns/field-transform.js';
import { fieldLookupEvaluator } from '../patterns/field-lookup.js';
import { requiredAllEvaluator } from '../patterns/required-all.js';

// Feature: validation-rules-engine, Property 8: Field override priority over section pattern
describe('Property 8: Field override priority over section pattern', () => {
  it('identity override in required_all section produces no error for that field', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((s) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)),
        (fieldName) => {
          // The field is empty — section pattern required_all would produce an error
          const responses: Record<string, unknown> = { [fieldName]: '' };
          const config = { sectionName: 'test-section', ruleName: 'test-rule' };

          // Section pattern required_all produces error for empty field
          const sectionErrors = requiredAllEvaluator([fieldName], responses, config);
          expect(sectionErrors.length).toBe(1);
          expect(sectionErrors[0].fieldName).toBe(fieldName);

          // Field identity override produces null (no error) for the same empty field
          const overrideResult = fieldIdentityEvaluator(
            fieldName,
            responses[fieldName],
            config,
            responses,
          );
          expect(overrideResult).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Feature: validation-rules-engine, Property 9: range evaluator produces error iff v < min OR v > max
describe('Property 9: range evaluator produces error iff v < min OR v > max', () => {
  it('returns error when value is outside [min, max]', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }),
        (a, b, value) => {
          const min = Math.min(a, b);
          const max = Math.max(a, b);

          // Skip degenerate case where min === max === value (always in range)
          if (min === max && max === value) return;

          const config = {
            min,
            max,
            sectionName: 'test-section',
            ruleName: 'test-rule',
          };
          const result = fieldRangeEvaluator('testField', value, config, {});

          if (value < min || value > max) {
            expect(result).not.toBeNull();
            expect(result!.fieldName).toBe('testField');
          } else {
            expect(result).toBeNull();
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns null for value within [min, max]', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
        (a, b, t) => {
          const min = Math.min(a, b);
          const max = Math.max(a, b);

          // Interpolate value within [min, max]
          const value = min + t * (max - min);

          const config = {
            min,
            max,
            sectionName: 'test-section',
            ruleName: 'test-rule',
          };
          const result = fieldRangeEvaluator('testField', value, config, {});
          expect(result).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Feature: validation-rules-engine, Property 10: pattern evaluator produces error iff regex does not match
describe('Property 10: pattern evaluator produces error iff regex does not match', () => {
  it('returns error iff regex does not match the value', () => {
    // Use a set of safe, predictable regex patterns
    const regexPatterns = fc.oneof(
      fc.constant('^[A-Z]+$'),
      fc.constant('^[0-9]+$'),
      fc.constant('^[a-z]+$'),
      fc.constant('^\\d{3,5}$'),
      fc.constant('^[A-Za-z0-9]+$'),
      fc.constant('^.+$'),
    );

    fc.assert(
      fc.property(regexPatterns, fc.string({ minLength: 1, maxLength: 20 }), (regexStr, value) => {
        const config = {
          regex: regexStr,
          sectionName: 'test-section',
          ruleName: 'test-rule',
        };

        const result = fieldPatternEvaluator('testField', value, config, {});

        const regex = new RegExp(regexStr);
        const matches = regex.test(value);

        if (matches) {
          expect(result).toBeNull();
        } else {
          expect(result).not.toBeNull();
          expect(result!.fieldName).toBe('testField');
        }
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: validation-rules-engine, Property 11: transform/computed tolerance check
describe('Property 11: transform/computed tolerance check', () => {
  it('error iff |value - expectedValue| > tolerance', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1e4, max: 1e4, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.001, max: 100, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: -1e4, max: 1e4, noNaN: true, noDefaultInfinity: true }),
        (expectedValue, tolerance, submittedValue) => {
          const config = {
            expectedValue,
            tolerance,
            sectionName: 'test-section',
            ruleName: 'test-rule',
          };

          const result = fieldTransformEvaluator('testField', submittedValue, config, {});

          const diff = Math.abs(submittedValue - expectedValue);

          if (diff > tolerance) {
            expect(result).not.toBeNull();
            expect(result!.fieldName).toBe('testField');
          } else {
            expect(result).toBeNull();
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Feature: validation-rules-engine, Property 12: lookup produces error iff value not in allowedValues
describe('Property 12: lookup produces error iff value not in allowedValues', () => {
  it('error iff String(value) not in allowedValues', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 10 }),
        fc.string({ minLength: 1, maxLength: 20 }),
        (allowedValues, value) => {
          const config = {
            allowedValues,
            sectionName: 'test-section',
            ruleName: 'test-rule',
          };

          const result = fieldLookupEvaluator('testField', value, config, {});

          if (allowedValues.includes(String(value))) {
            expect(result).toBeNull();
          } else {
            expect(result).not.toBeNull();
            expect(result!.fieldName).toBe('testField');
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
