/**
 * Field Evaluator: transform
 *
 * Validates that a submitted value matches an expected computed value
 * within a configured tolerance. For MVP, the expected value is provided
 * directly in config.expectedValue.
 *
 * @module patterns/field-transform
 * @requirements 7.5
 */

import type {
  FieldEvaluator,
  FieldOverrideConfig,
  ValidationError,
} from '../validation.types.js';

/**
 * Transform field evaluator.
 * Returns a ValidationError if |Number(value) - expectedValue| > tolerance.
 * Returns null if the value is empty/NaN or if expectedValue is not configured.
 */
export const fieldTransformEvaluator: FieldEvaluator = (
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

  const expectedValue = config.expectedValue as number | undefined;
  if (expectedValue === undefined || expectedValue === null) {
    // No expected value configured — skip validation
    return null;
  }

  const tolerance = (config.tolerance as number) ?? 0.01;

  if (Math.abs(numValue - expectedValue) > tolerance) {
    return {
      fieldName,
      sectionName: (config.sectionName as string) || '',
      ruleName: (config.ruleName as string) || '',
      message: 'El valor no coincide con el resultado esperado',
      ruleType: (config.ruleType as 'global' | 'custom') || 'global',
    };
  }

  return null;
};
