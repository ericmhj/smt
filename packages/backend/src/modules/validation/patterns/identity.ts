/**
 * Identity section pattern evaluator — H(s) = 1 (no-op).
 *
 * Returns an empty array regardless of input, meaning no validation
 * is applied to any fields in the section.
 *
 * @module validation/patterns/identity
 * @requirements 6.1
 */

import type {
  PatternConfig,
  PatternEvaluator,
  ValidationError,
} from '../validation.types.js';

/**
 * Identity pattern evaluator.
 * Always returns an empty array (no validation errors).
 */
export const identityEvaluator: PatternEvaluator = (
  _fields: string[],
  _responses: Record<string, unknown>,
  _config: PatternConfig,
  _previousResponses?: Record<string, unknown>,
): ValidationError[] => {
  return [];
};

export default identityEvaluator;
