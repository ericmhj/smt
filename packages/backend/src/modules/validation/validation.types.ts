/**
 * Validation Rules Engine - Type Definitions
 *
 * Core TypeScript types for the configurable, multi-layered form validation engine.
 * Uses a "transfer function" metaphor where H(s)=1 means identity (no validation).
 *
 * @module validation.types
 * @requirements 1.3, 1.4, 5.1
 */

// ─── Section Patterns ────────────────────────────────────────────────────────

/**
 * Section-level validation pattern (transfer function applied to all fields in a section).
 * - `identity`: No validation (H(s)=1)
 * - `required_all`: All fields must be non-empty
 * - `numeric_range`: All numeric fields within [min, max]
 * - `readonly`: No field values may change from previous submission
 * - `conditional`: Validation depends on another field's value
 */
export type SectionPattern =
  | 'identity'
  | 'required_all'
  | 'numeric_range'
  | 'readonly'
  | 'conditional';

// ─── Field Transfer Functions ────────────────────────────────────────────────

/**
 * Field-level transfer function that overrides the parent section pattern for a specific field.
 * - `identity`: Skip validation for this field
 * - `required`: Field must be non-empty
 * - `range`: Field value must be within [min, max]
 * - `pattern`: Field value must match a regex
 * - `transform`: Computed value via formula, checked within tolerance
 * - `lookup`: Field value must exist in allowedValues list
 * - `computed`: Expression referencing other fields, checked within tolerance
 */
export type FieldTransferFunction =
  | 'identity'
  | 'required'
  | 'range'
  | 'pattern'
  | 'transform'
  | 'lookup'
  | 'computed';

// ─── Configuration Types ─────────────────────────────────────────────────────

/**
 * Configuration object for a section pattern evaluator.
 * Shape varies by pattern type (e.g., numeric_range needs min/max, conditional needs dependsOnField).
 */
export type PatternConfig = Record<string, unknown>;

/**
 * Configuration object for a field override evaluator.
 * Shape varies by transfer function (e.g., range needs min/max, pattern needs regex).
 */
export type FieldOverrideConfig = Record<string, unknown>;

// ─── Core Interfaces ─────────────────────────────────────────────────────────

/**
 * Result of validation evaluation.
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * A single validation error for a specific field.
 */
export interface ValidationError {
  fieldName: string;
  sectionName: string;
  ruleName: string;
  message: string;
  ruleType: 'global' | 'custom';
}

/**
 * A section within a rule definition, specifying the pattern and optional field-level overrides.
 * Stored as JSONB in the `sections` column of `validation_rule_templates`.
 */
export interface RuleSection {
  sectionName: string;
  pattern: SectionPattern;
  patternConfig: PatternConfig;
  fieldOverrides?: FieldOverride[];
}

/**
 * A per-field transfer function override within a section.
 * Takes priority over the parent section pattern for this specific field.
 */
export interface FieldOverride {
  fieldName: string;
  transferFunction: FieldTransferFunction;
  config: FieldOverrideConfig;
}

/**
 * A globally defined validation rule template associated with a form type.
 * Stored in `public.validation_rule_templates`.
 */
export interface RuleTemplate {
  id: string;
  formType: string;
  name: string;
  description?: string;
  isActive: boolean;
  sections: RuleSection[];
  createdBy?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * A per-tenant rule override for a specific form instance.
 * Stored in `{tenant_schema}.validation_rule_overrides`.
 */
export interface RuleOverride {
  id: string;
  formId: string;
  ruleTemplateId?: string;
  overrideType: 'deactivate' | 'custom';
  customRule?: RuleSection[];
  createdBy: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * A computed rule in the effective rule set (after merging globals with overrides).
 */
export interface EffectiveRule {
  id: string;
  name: string;
  source: 'global' | 'custom';
  sections: RuleSection[];
}

// ─── Evaluator Function Types ────────────────────────────────────────────────

/**
 * Evaluator function for a section-level pattern.
 * Receives all field names in the section, the submitted responses, pattern config,
 * and optionally the previous responses (needed for `readonly` pattern).
 * Returns an array of validation errors (empty if all fields pass).
 */
export type PatternEvaluator = (
  fields: string[],
  responses: Record<string, unknown>,
  config: PatternConfig,
  previousResponses?: Record<string, unknown>,
) => ValidationError[];

/**
 * Evaluator function for a field-level override.
 * Receives the field name, its submitted value, the override config,
 * and all responses (needed for `computed` evaluators referencing other fields).
 * Returns a single ValidationError if the field fails, or null if it passes.
 */
export type FieldEvaluator = (
  fieldName: string,
  value: unknown,
  config: FieldOverrideConfig,
  allResponses: Record<string, unknown>,
) => ValidationError | null;
