/**
 * Validation Rules Engine - Zod Schemas
 *
 * Zod validation schemas for API payloads: rule template CRUD,
 * override management, effective rule responses, and structural validation.
 *
 * @module validation.schemas
 * @requirements 10.1, 11.1, 11.2
 */

import { z } from 'zod';

// ─── Enum Values ─────────────────────────────────────────────────────────────

const sectionPatternValues = [
  'identity',
  'required_all',
  'numeric_range',
  'readonly',
  'conditional',
] as const;

const fieldTransferFunctionValues = [
  'identity',
  'required',
  'range',
  'pattern',
  'transform',
  'lookup',
  'computed',
] as const;

// ─── Reusable Field Schemas ──────────────────────────────────────────────────

/**
 * Schema for a single field override within a section.
 */
export const fieldOverrideSchema = z.object({
  fieldName: z.string().min(1, 'fieldName es requerido'),
  transferFunction: z.enum(fieldTransferFunctionValues, {
    errorMap: () => ({ message: 'transferFunction debe ser un valor válido' }),
  }),
  config: z.record(z.string(), z.unknown()).default({}),
});

/**
 * Schema for a single section within a rule definition.
 */
export const ruleSectionSchema = z.object({
  sectionName: z.string().min(1, 'sectionName es requerido'),
  pattern: z.enum(sectionPatternValues, {
    errorMap: () => ({ message: 'pattern debe ser un Section_Pattern válido' }),
  }),
  patternConfig: z.record(z.string(), z.unknown()).default({}),
  fieldOverrides: z.array(fieldOverrideSchema).optional(),
});

// ─── Rule Template Schemas ───────────────────────────────────────────────────

/**
 * Schema for creating a new rule template.
 * @requirements 10.1
 */
export const createRuleTemplateSchema = z.object({
  form_type: z.string().min(1, 'form_type es requerido'),
  name: z.string().min(1, 'name es requerido'),
  description: z.string().optional(),
  sections: z
    .array(ruleSectionSchema)
    .min(1, 'Se requiere al menos una sección'),
});

/**
 * Schema for updating an existing rule template (partial update).
 * All fields are optional to support PATCH-style updates.
 * @requirements 10.1
 */
export const updateRuleTemplateSchema = z.object({
  form_type: z.string().min(1, 'form_type es requerido').optional(),
  name: z.string().min(1, 'name es requerido').optional(),
  description: z.string().optional(),
  sections: z
    .array(ruleSectionSchema)
    .min(1, 'Se requiere al menos una sección')
    .optional(),
});

// ─── Override Schemas ─────────────────────────────────────────────────────────

/**
 * Schema for creating a rule override (deactivate or custom).
 * @requirements 11.1, 11.2
 */
export const createOverrideSchema = z
  .object({
    override_type: z.enum(['deactivate', 'custom'], {
      errorMap: () => ({
        message: "override_type debe ser 'deactivate' o 'custom'",
      }),
    }),
    rule_template_id: z.string().uuid('rule_template_id debe ser un UUID válido').optional(),
    custom_rule: z.array(ruleSectionSchema).optional(),
  })
  .refine(
    (data) => {
      if (data.override_type === 'deactivate') {
        return !!data.rule_template_id;
      }
      return true;
    },
    {
      message: 'rule_template_id es requerido cuando override_type es "deactivate"',
      path: ['rule_template_id'],
    },
  )
  .refine(
    (data) => {
      if (data.override_type === 'custom') {
        return !!data.custom_rule && data.custom_rule.length > 0;
      }
      return true;
    },
    {
      message: 'custom_rule es requerido cuando override_type es "custom"',
      path: ['custom_rule'],
    },
  );

// ─── Response Schemas ────────────────────────────────────────────────────────

/**
 * Schema for a single effective rule in the response.
 */
export const effectiveRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  source: z.enum(['global', 'custom']),
  sections: z.array(ruleSectionSchema),
});

/**
 * Schema for the effective rule set response.
 */
export const effectiveRuleResponseSchema = z.array(effectiveRuleSchema);

/**
 * Schema for the structural validation response.
 * @requirements 18.1
 */
export const structuralValidationResponseSchema = z.object({
  valid: z.boolean(),
  missingFields: z.array(z.string()),
  missingSections: z.array(z.string()),
});

// ─── Inferred Types ──────────────────────────────────────────────────────────

export type CreateRuleTemplateInput = z.infer<typeof createRuleTemplateSchema>;
export type UpdateRuleTemplateInput = z.infer<typeof updateRuleTemplateSchema>;
export type CreateOverrideInput = z.infer<typeof createOverrideSchema>;
export type EffectiveRuleResponse = z.infer<typeof effectiveRuleResponseSchema>;
export type StructuralValidationResponse = z.infer<typeof structuralValidationResponseSchema>;
export type RuleSectionInput = z.infer<typeof ruleSectionSchema>;
export type FieldOverrideInput = z.infer<typeof fieldOverrideSchema>;
