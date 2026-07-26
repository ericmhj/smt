/**
 * Section Pattern Evaluator: readonly
 *
 * Rejects fields where the submitted value differs from the previously stored value.
 * If no previous responses are available, all fields pass (nothing to compare against).
 *
 * Uses loose string comparison: String(current ?? '') !== String(previous ?? '')
 *
 * @module validation/patterns/readonly
 * @requirements 6.4
 */

import type { PatternConfig, PatternEvaluator, ValidationError } from '../validation.types.js';

export const readonlyEvaluator: PatternEvaluator = (
  fields: string[],
  responses: Record<string, unknown>,
  config: PatternConfig,
  previousResponses?: Record<string, unknown>,
): ValidationError[] => {
  if (!previousResponses) {
    return [];
  }

  const errors: ValidationError[] = [];

  for (const field of fields) {
    const currentValue = String(responses[field] ?? '');
    const previousValue = String(previousResponses[field] ?? '');

    if (currentValue !== previousValue) {
      errors.push({
        fieldName: field,
        sectionName: (config.sectionName as string) ?? '',
        ruleName: (config.ruleName as string) ?? '',
        message: 'Este campo es de solo lectura y no puede ser modificado',
        ruleType: (config.ruleType as 'global' | 'custom') ?? 'global',
      });
    }
  }

  return errors;
};
