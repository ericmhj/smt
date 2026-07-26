// Feature: validation-rules-engine, Property 3: N field violations produce exactly N error objects

/**
 * Property-Based Test: Error Completeness
 *
 * Validates that the number of violations equals the number of error objects
 * produced by the required_all evaluator.
 *
 * **Validates: Requirements 5.3, 8.2, 8.3**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { requiredAllEvaluator } from '../patterns/required-all.js';

/**
 * Generates a unique array of valid field names (alphanumeric identifiers).
 */
const fieldNameArb = fc.stringMatching(/^[a-z][a-z0-9_]{1,20}$/);

const uniqueFieldNamesArb = (min: number, max: number) =>
  fc.uniqueArray(fieldNameArb, { minLength: min, maxLength: max });

describe('Property 3: N field violations produce exactly N error objects', () => {
  it('all N fields empty/null produces exactly N errors, one per field', () => {
    fc.assert(
      fc.property(
        uniqueFieldNamesArb(1, 10),
        fc.constantFrom(null, undefined, ''),
        (fieldNames, emptyValue) => {
          // Build responses where all fields are empty/null
          const responses: Record<string, unknown> = {};
          for (const name of fieldNames) {
            responses[name] = emptyValue;
          }

          const config = {
            sectionName: 'test_section',
            ruleName: 'test_rule',
            ruleType: 'global' as const,
          };

          const errors = requiredAllEvaluator(fieldNames, responses, config);

          // Assert: exactly N errors returned
          expect(errors.length).toBe(fieldNames.length);

          // Assert: each error has a unique fieldName matching one of the input fields
          const errorFieldNames = errors.map((e) => e.fieldName);
          const uniqueErrorFields = new Set(errorFieldNames);
          expect(uniqueErrorFields.size).toBe(fieldNames.length);

          for (const fieldName of fieldNames) {
            expect(uniqueErrorFields.has(fieldName)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('K fields with values and M fields empty produces exactly M errors', () => {
    fc.assert(
      fc.property(
        uniqueFieldNamesArb(1, 10),
        uniqueFieldNamesArb(1, 10),
        fc.constantFrom(null, undefined, ''),
        (filledFieldNames, emptyFieldNames, emptyValue) => {
          // Ensure no overlap between filled and empty field names
          const filledSet = new Set(filledFieldNames);
          const actualEmptyFields = emptyFieldNames.filter(
            (f) => !filledSet.has(f),
          );

          // If after dedup we have no empty fields, skip this case
          if (actualEmptyFields.length === 0) return;

          const allFields = [...filledFieldNames, ...actualEmptyFields];

          // Build responses: filled fields have non-empty values, empty fields have empty value
          const responses: Record<string, unknown> = {};
          for (const name of filledFieldNames) {
            responses[name] = 'some_value';
          }
          for (const name of actualEmptyFields) {
            responses[name] = emptyValue;
          }

          const config = {
            sectionName: 'test_section',
            ruleName: 'test_rule',
            ruleType: 'global' as const,
          };

          const errors = requiredAllEvaluator(allFields, responses, config);

          // Assert: exactly M errors produced (one per empty field)
          expect(errors.length).toBe(actualEmptyFields.length);

          // Assert: each error corresponds to one of the empty fields
          const errorFieldNames = new Set(errors.map((e) => e.fieldName));
          for (const emptyField of actualEmptyFields) {
            expect(errorFieldNames.has(emptyField)).toBe(true);
          }

          // Assert: no errors for filled fields
          for (const filledField of filledFieldNames) {
            expect(errorFieldNames.has(filledField)).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
