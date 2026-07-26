/**
 * Field Evaluator: required
 *
 * Validates that a field has a non-empty value.
 * Returns an error if the value is null, undefined, or empty string.
 *
 * @module patterns/field-required
 * @requirements 7.2
 */

import type {
  FieldEvaluator,
  FieldOverrideConfig,
  ValidationError,
} from '../validation.types.js';

/**
 * Required field evaluator.
 * Returns a ValidationError if the field value is null, undefined, or ''.
 */
export const fieldRequiredEvaluator: FieldEvaluator = (
  fieldName: string,
  value: unknown,
  config: FieldOverrideConfig,
  _allResponses: Record<string, unknown>,
): ValidationError | null => {
  if (value === null || value === undefined || value === '') {
    return {
      fieldName,
      sectionName: (config.sectionName as string) || '',
      ruleName: (config.ruleName as string) || '',
      message: 'El campo es obligatorio',
      ruleType: (config.ruleType as 'global' | 'custom') || 'global',
    };
  }

  return null;
};
