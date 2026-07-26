/**
 * Section Pattern Evaluator: required_all
 *
 * Validates that every field in the section has a non-empty value.
 * A field is considered empty if its value is null, undefined, or an empty string ('').
 *
 * @module patterns/required-all
 * @requirements 6.2
 */

import type { PatternConfig, PatternEvaluator, ValidationError } from '../validation.types.js';

/**
 * Evaluates the `required_all` section pattern.
 *
 * Iterates through all fields in the section and checks that each field's
 * response value is not null, undefined, or empty string.
 * Returns a ValidationError for each field that fails the check.
 */
export const requiredAllEvaluator: PatternEvaluator = (
  fields: string[],
  responses: Record<string, unknown>,
  config: PatternConfig,
  _previousResponses?: Record<string, unknown>,
): ValidationError[] => {
  const errors: ValidationError[] = [];

  for (const field of fields) {
    const value = responses[field];

    if (value === null || value === undefined || value === '') {
      errors.push({
        fieldName: field,
        sectionName: (config.sectionName as string) || '',
        ruleName: (config.ruleName as string) || '',
        message: 'El campo es obligatorio',
        ruleType: (config.ruleType as 'global' | 'custom') || 'global',
      });
    }
  }

  return errors;
};
