/**
 * Field Evaluator: pattern
 *
 * Validates that a field value matches a configured regular expression.
 * If the value is empty/null, skips validation.
 * If the regex is invalid, gracefully degrades (returns null).
 *
 * @module patterns/field-pattern
 * @requirements 7.4
 */

import type {
  FieldEvaluator,
  FieldOverrideConfig,
  ValidationError,
} from '../validation.types.js';

/**
 * Pattern field evaluator.
 * Returns a ValidationError if the string value does not match config.regex.
 * Returns null if the value is empty, or if the regex is invalid (graceful degradation).
 */
export const fieldPatternEvaluator: FieldEvaluator = (
  fieldName: string,
  value: unknown,
  config: FieldOverrideConfig,
  _allResponses: Record<string, unknown>,
): ValidationError | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const regexStr = config.regex as string;
  if (!regexStr) {
    return null;
  }

  let regex: RegExp;
  try {
    regex = new RegExp(regexStr);
  } catch {
    // Graceful degradation: invalid regex skips validation
    return null;
  }

  if (!regex.test(String(value))) {
    return {
      fieldName,
      sectionName: (config.sectionName as string) || '',
      ruleName: (config.ruleName as string) || '',
      message:
        (config.message as string) ||
        'El valor no cumple con el formato requerido',
      ruleType: (config.ruleType as 'global' | 'custom') || 'global',
    };
  }

  return null;
};
