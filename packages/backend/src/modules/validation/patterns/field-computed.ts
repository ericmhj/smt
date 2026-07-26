/**
 * Field Evaluator: computed
 *
 * Evaluates a simple arithmetic expression referencing other field values
 * and validates that the submitted value matches the computed result
 * within a configured tolerance.
 *
 * Supported operations: +, -, *, /
 * Expression format: "fieldA + fieldB", "fieldA * fieldB - fieldC"
 *
 * Graceful degradation: if the expression cannot be evaluated, returns null.
 *
 * @module patterns/field-computed
 * @requirements 7.7
 */

import type {
  FieldEvaluator,
  FieldOverrideConfig,
  ValidationError,
} from '../validation.types.js';

/**
 * Safely evaluates a simple arithmetic expression by replacing field
 * references with their numeric values from allResponses.
 *
 * Only supports: numbers, +, -, *, /, parentheses, and whitespace.
 * Returns NaN if the expression cannot be safely evaluated.
 */
function safeEvaluateExpression(
  expression: string,
  allResponses: Record<string, unknown>,
): number {
  // Replace field references with their numeric values
  // Field names can contain letters, digits, underscores, and hyphens
  let resolved = expression;
  const fieldRefPattern = /[a-zA-Z_][a-zA-Z0-9_-]*/g;
  const matches = expression.match(fieldRefPattern);

  if (matches) {
    // Deduplicate field references
    const uniqueFields = [...new Set(matches)];
    for (const fieldRef of uniqueFields) {
      const fieldValue = allResponses[fieldRef];
      const numericValue = Number(fieldValue);
      if (isNaN(numericValue)) {
        return NaN;
      }
      // Replace all occurrences of this field reference
      resolved = resolved.replaceAll(fieldRef, String(numericValue));
    }
  }

  // Validate that the resolved expression only contains safe characters
  if (!/^[\d\s+\-*/().]+$/.test(resolved)) {
    return NaN;
  }

  try {
    // Use Function constructor for safe math evaluation
    // The resolved string only contains numbers and arithmetic operators at this point
    const result = new Function(`return (${resolved});`)() as number;
    if (typeof result !== 'number' || !isFinite(result)) {
      return NaN;
    }
    return result;
  } catch {
    return NaN;
  }
}

/**
 * Computed field evaluator.
 * Evaluates config.expression using values from allResponses,
 * then checks if |Number(value) - computed| > tolerance.
 * Returns null if value is empty, expression can't be evaluated (graceful degradation).
 */
export const fieldComputedEvaluator: FieldEvaluator = (
  fieldName: string,
  value: unknown,
  config: FieldOverrideConfig,
  allResponses: Record<string, unknown>,
): ValidationError | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numValue = Number(value);
  if (isNaN(numValue)) {
    return null;
  }

  const expression = config.expression as string | undefined;
  if (!expression) {
    return null;
  }

  const tolerance = (config.tolerance as number) ?? 0.01;

  const expected = safeEvaluateExpression(expression, allResponses);
  if (isNaN(expected)) {
    // Graceful degradation: can't evaluate expression, skip validation
    return null;
  }

  if (Math.abs(numValue - expected) > tolerance) {
    return {
      fieldName,
      sectionName: (config.sectionName as string) || '',
      ruleName: (config.ruleName as string) || '',
      message: 'El valor calculado no coincide con el esperado',
      ruleType: (config.ruleType as 'global' | 'custom') || 'global',
    };
  }

  return null;
};
