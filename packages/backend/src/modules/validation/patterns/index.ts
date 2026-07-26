/**
 * Pattern Evaluator Registry
 *
 * Factory function that returns the appropriate PatternEvaluator
 * for a given SectionPattern type.
 *
 * @module patterns/index
 * @requirements 6.1, 6.2, 6.3, 6.4, 6.5
 */

import type { PatternEvaluator, SectionPattern } from '../validation.types.js';
import { identityEvaluator } from './identity.js';
import { requiredAllEvaluator } from './required-all.js';
import { numericRangeEvaluator } from './numeric-range.js';
import { readonlyEvaluator } from './readonly.js';
import { conditionalEvaluator } from './conditional.js';

const evaluatorMap: Record<string, PatternEvaluator> = {
  identity: identityEvaluator,
  required_all: requiredAllEvaluator,
  numeric_range: numericRangeEvaluator,
  readonly: readonlyEvaluator,
  conditional: conditionalEvaluator,
};

/**
 * Returns the appropriate PatternEvaluator for the given section pattern.
 * Falls back to identity evaluator for unknown patterns.
 */
export function getPatternEvaluator(pattern: SectionPattern): PatternEvaluator {
  return evaluatorMap[pattern] || identityEvaluator;
}

export { identityEvaluator } from './identity.js';
export { requiredAllEvaluator } from './required-all.js';
export { numericRangeEvaluator } from './numeric-range.js';
export { readonlyEvaluator } from './readonly.js';
export { conditionalEvaluator } from './conditional.js';
