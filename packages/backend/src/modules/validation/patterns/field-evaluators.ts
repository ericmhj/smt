/**
 * Field Evaluator Registry
 *
 * Factory function that returns the appropriate FieldEvaluator
 * for a given FieldTransferFunction type.
 *
 * @module patterns/field-evaluators
 * @requirements 7.1, 7.8
 */

import type { FieldEvaluator, FieldTransferFunction } from '../validation.types.js';
import { fieldIdentityEvaluator } from './field-identity.js';
import { fieldRequiredEvaluator } from './field-required.js';
import { fieldRangeEvaluator } from './field-range.js';
import { fieldPatternEvaluator } from './field-pattern.js';
import { fieldTransformEvaluator } from './field-transform.js';
import { fieldLookupEvaluator } from './field-lookup.js';
import { fieldComputedEvaluator } from './field-computed.js';

const evaluatorMap: Record<string, FieldEvaluator> = {
  identity: fieldIdentityEvaluator,
  required: fieldRequiredEvaluator,
  range: fieldRangeEvaluator,
  pattern: fieldPatternEvaluator,
  transform: fieldTransformEvaluator,
  lookup: fieldLookupEvaluator,
  computed: fieldComputedEvaluator,
};

/**
 * Returns the appropriate FieldEvaluator for the given field transfer function.
 * Falls back to fieldIdentityEvaluator for unknown transfer functions.
 */
export function getFieldEvaluator(transferFunction: FieldTransferFunction): FieldEvaluator {
  return evaluatorMap[transferFunction] || fieldIdentityEvaluator;
}

export { fieldIdentityEvaluator } from './field-identity.js';
export { fieldRequiredEvaluator } from './field-required.js';
export { fieldRangeEvaluator } from './field-range.js';
export { fieldPatternEvaluator } from './field-pattern.js';
export { fieldTransformEvaluator } from './field-transform.js';
export { fieldLookupEvaluator } from './field-lookup.js';
export { fieldComputedEvaluator } from './field-computed.js';
