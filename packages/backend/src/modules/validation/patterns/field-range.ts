/**
 * Field Evaluator: range
 *
 * Validates that a numeric field value falls within [min, max] inclusive.
 * If the value is empty, null, or cannot be parsed as a number, skips validation.
 *
 * @module patterns/field-range
 * @requirements 7.3
 */

import type {
  FieldEvaluator,
  FieldOverrideConfig,
  ValidationError,
} from '../validation.types.js';

/**
 * Range field evaluator.
 * Returns a ValidationError if the numeric value is outside [min, max].
 * Returns null if the value is empty/NaN (skips) or within range.
 */
export const fieldRangeEvaluator: FieldEvaluator = (
  fieldName: string,
  value: unknown,
  config: FieldOverrideConfig,
  _allResponses: Record<string, unknown>,
): ValidationError | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numValue = Number(value);
  if (isNaN(numValue)) {
    return null;
  }

  const min = config.min as number;
  const max = config.max as number;

  if (numValue < min || numValue > max) {
    return {
      fieldName,
      sectionName: (config.sectionName as string) || '',
      ruleName: (config.ruleName as string) || '',
      message: `El valor debe estar entre ${min} y ${max}`,
      ruleType: (config.ruleType as 'global' | 'custom') || 'global',
    };
  }

  return null;
};
