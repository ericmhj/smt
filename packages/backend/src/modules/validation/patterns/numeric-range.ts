/**
 * Section Pattern Evaluator: numeric_range
 *
 * Validates that every numeric field in the section has a value within [min, max] inclusive.
 * Fields that are empty/null/undefined are skipped (handled by required_all).
 * Fields whose value is not a valid number (NaN after parsing) are also skipped.
 *
 * @module patterns/numeric-range
 * @requirements 6.3
 */

import type { PatternConfig, PatternEvaluator, ValidationError } from '../validation.types.js';

/**
 * Evaluates the `numeric_range` section pattern.
 *
 * Iterates through all fields in the section and checks that each numeric
 * field's value falls within the configured [min, max] range (inclusive).
 * Returns a ValidationError for each field that is out of range.
 */
export const numericRangeEvaluator: PatternEvaluator = (
  fields: string[],
  responses: Record<string, unknown>,
  config: PatternConfig,
  _previousResponses?: Record<string, unknown>,
): ValidationError[] => {
  const errors: ValidationError[] = [];
  const min = typeof config.min === 'number' ? config.min : 0;
  const max = typeof config.max === 'number' ? config.max : Infinity;

  for (const field of fields) {
    const value = responses[field];

    // Skip validation if value is empty/null/undefined (that's for required_all to catch)
    if (value === null || value === undefined || value === '') {
      continue;
    }

    const numericValue = Number(value);

    // Skip validation if value is not a valid number
    if (Number.isNaN(numericValue)) {
      continue;
    }

    if (numericValue < min || numericValue > max) {
      errors.push({
        fieldName: field,
        sectionName: (config.sectionName as string) || '',
        ruleName: (config.ruleName as string) || '',
        message: `El valor debe estar entre ${min} y ${max}`,
        ruleType: (config.ruleType as 'global' | 'custom') || 'global',
      });
    }
  }

  return errors;
};
