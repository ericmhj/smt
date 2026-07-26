/**
 * Field Evaluator: identity
 *
 * Always returns null (skip validation for this field).
 * Used when a field override with transferFunction 'identity' is applied,
 * effectively exempting the field from any section-level validation.
 *
 * @module patterns/field-identity
 * @requirements 7.1
 */

import type { FieldEvaluator, FieldOverrideConfig } from '../validation.types.js';

/**
 * Identity field evaluator.
 * Always returns null — the field passes regardless of its value.
 */
export const fieldIdentityEvaluator: FieldEvaluator = (
  _fieldName: string,
  _value: unknown,
  _config: FieldOverrideConfig,
  _allResponses: Record<string, unknown>,
): null => {
  return null;
};
