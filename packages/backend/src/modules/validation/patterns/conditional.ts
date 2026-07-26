/**
 * Section Pattern Evaluator: conditional
 *
 * Evaluates a condition based on another field's value. If the condition is met,
 * delegates validation to the configured `thenPattern` evaluator. If the condition
 * is not met, returns an empty array (identity behavior — H(s) = 1).
 *
 * @module patterns/conditional
 * @requirements 6.5, 6.6
 */

import type {
  PatternConfig,
  PatternEvaluator,
  SectionPattern,
  ValidationError,
} from '../validation.types.js';
import { getPatternEvaluator } from './index.js';

/**
 * Evaluates the `conditional` section pattern.
 *
 * 1. Extracts `dependsOnField`, `dependsOnValue`, and `thenPattern` from config.
 * 2. Gets the actual value from responses[dependsOnField].
 * 3. Compares using String coercion: String(actualValue) === String(dependsOnValue).
 * 4. If condition NOT met: returns [] (identity behavior).
 * 5. If condition IS met: delegates to the `thenPattern` evaluator via the registry.
 */
export const conditionalEvaluator: PatternEvaluator = (
  fields: string[],
  responses: Record<string, unknown>,
  config: PatternConfig,
  previousResponses?: Record<string, unknown>,
): ValidationError[] => {
  const dependsOnField = config.dependsOnField as string | undefined;
  const dependsOnValue = config.dependsOnValue as unknown;
  const thenPattern = config.thenPattern as SectionPattern | undefined;

  // If required config is missing, behave as identity (no validation)
  if (!dependsOnField || !thenPattern) {
    return [];
  }

  // Get the actual value of the field we depend on
  const actualValue = responses[dependsOnField];

  // Compare using String coercion
  if (String(actualValue) !== String(dependsOnValue)) {
    // Condition not met — identity behavior
    return [];
  }

  // Condition is met — delegate to the thenPattern evaluator
  const delegateEvaluator = getPatternEvaluator(thenPattern);

  // Build config for the delegated evaluator, merging thenPatternConfig with metadata
  const delegateConfig: PatternConfig = {
    ...(config.thenPatternConfig as PatternConfig | undefined),
    sectionName: config.sectionName,
    ruleName: config.ruleName,
    ruleType: config.ruleType,
  };

  return delegateEvaluator(fields, responses, delegateConfig, previousResponses);
};

export default conditionalEvaluator;
