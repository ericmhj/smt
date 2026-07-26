/**
 * Field Evaluator: lookup
 *
 * Validates that a field value exists within a configured list of allowed values.
 * If the value is empty/null, skips validation.
 *
 * @module patterns/field-lookup
 * @requirements 7.6
 */

import type {
  FieldEvaluator,
  FieldOverrideConfig,
  ValidationError,
} from '../validation.types.js';

/**
 * Lookup field evaluator.
 * Returns a ValidationError if String(value) is not in config.allowedValues.
 * Returns null if the value is empty/null or allowedValues is not configured.
 */
export const fieldLookupEvaluator: FieldEvaluator = (
  fieldName: string,
  value: unknown,
  config: FieldOverrideConfig,
  _allResponses: Record<string, unknown>,
): ValidationError | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const allowedValues = config.allowedValues as string[] | undefined;
  if (!allowedValues || !Array.isArray(allowedValues)) {
    return null;
  }

  if (!allowedValues.includes(String(value))) {
    return {
      fieldName,
      sectionName: (config.sectionName as string) || '',
      ruleName: (config.ruleName as string) || '',
      message: 'El valor no es una opción válida',
      ruleType: (config.ruleType as 'global' | 'custom') || 'global',
    };
  }

  return null;
};
