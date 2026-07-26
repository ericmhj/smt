/**
 * Validation Engine
 *
 * Core service responsible for computing the effective rule set and
 * evaluating validation rules against form submission data.
 *
 * Uses the transfer function metaphor: H(s)=1 means identity (no validation).
 * When no rules exist for a form type, data passes through unchanged.
 *
 * @module validation-engine
 * @requirements 5.1, 5.4, 3.1, 3.2, 3.3, 4.5
 */

import { eq, and } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import {
  validationRuleTemplates,
  validationRuleOverrides,
} from '../../db/schema/index.js';
import type {
  EffectiveRule,
  RuleSection,
  ValidationError,
  ValidationResult,
} from './validation.types.js';
import { getPatternEvaluator } from './patterns/index.js';
import { getFieldEvaluator } from './patterns/field-evaluators.js';

/**
 * Represents the fields metadata for a form, used to resolve which fields
 * belong to which sections during validation.
 */
export interface FormField {
  sectionName: string;
  fields: string[];
}

/**
 * Computes the effective rule set for a given form by merging global
 * rule templates with tenant-level overrides.
 *
 * Formula:
 *   Effective_Rule_Set(form) =
 *     (active global rules for form_type)
 *     − (deactivated overrides for form_id)
 *     + (custom overrides for form_id)
 *
 * @param db - Drizzle database instance (with tenant search_path already set)
 * @param formType - The form type classification (e.g., "nom025")
 * @param formId - The specific form instance UUID
 * @returns The computed effective rule set
 *
 * @requirements 5.1, 5.4, 3.1, 3.2, 3.3, 4.5
 */
export async function computeEffectiveRuleSet(
  db: Database,
  formType: string,
  formId: string,
): Promise<EffectiveRule[]> {
  // 1. Query all active global rule templates for this form type
  const globalRules = await db
    .select()
    .from(validationRuleTemplates)
    .where(
      and(
        eq(validationRuleTemplates.formType, formType),
        eq(validationRuleTemplates.isActive, true),
      ),
    );

  // 2. Query all tenant-level overrides for this specific form
  const overrides = await db
    .select()
    .from(validationRuleOverrides)
    .where(eq(validationRuleOverrides.formId, formId));

  // 3. Identify deactivated rule template IDs
  const deactivatedIds = new Set(
    overrides
      .filter((o) => o.overrideType === 'deactivate' && o.ruleTemplateId)
      .map((o) => o.ruleTemplateId!),
  );

  // 4. Filter out deactivated rules from globals and map to EffectiveRule
  const activeGlobalRules: EffectiveRule[] = globalRules
    .filter((rule) => !deactivatedIds.has(rule.id))
    .map((rule) => ({
      id: rule.id,
      name: rule.name,
      source: 'global' as const,
      sections: rule.sections as RuleSection[],
    }));

  // 5. Map custom overrides to EffectiveRule
  const customRules: EffectiveRule[] = overrides
    .filter((o) => o.overrideType === 'custom' && o.customRule)
    .map((o) => ({
      id: `custom-${o.id}`,
      name: `Regla personalizada`,
      source: 'custom' as const,
      sections: o.customRule as RuleSection[],
    }));

  // 6. Return combined set: active globals + custom overrides
  return [...activeGlobalRules, ...customRules];
}

/**
 * Validates form submission data against the effective rule set.
 *
 * Orchestrates the full validation pipeline:
 * 1. Computes the effective rule set for the form
 * 2. Iterates each rule's sections
 * 3. For each section: resolves fields from fieldsMetadata, applies section pattern evaluator
 * 4. For fields with overrides: applies field evaluator instead of section pattern
 * 5. Collects all ValidationError objects
 *
 * Graceful degradation: if DB query fails or any unexpected error occurs,
 * treats as H(s)=1 (identity) and returns { valid: true, errors: [] }.
 *
 * @param db - Drizzle database instance
 * @param formId - The form instance UUID
 * @param formType - The form type classification
 * @param responses - The submitted field values
 * @param fieldsMetadata - Metadata describing sections and their fields
 * @param previousResponses - Previous submission values (needed for readonly pattern)
 * @returns ValidationResult with valid flag and any errors
 *
 * @requirements 5.2, 5.3, 7.8, 8.1, 8.5, 13.2
 */
export async function validate(
  db: Database,
  formId: string,
  formType: string,
  responses: Record<string, unknown>,
  fieldsMetadata: FormField[],
  previousResponses?: Record<string, unknown>,
): Promise<ValidationResult> {
  try {
    // 1. Compute the effective rule set. On DB failure, graceful degradation (H(s)=1).
    let effectiveRules: EffectiveRule[];
    try {
      effectiveRules = await computeEffectiveRuleSet(db, formType, formId);
    } catch (err) {
      console.error('[ValidationEngine] Failed to compute effective rule set, falling back to identity:', err);
      return { valid: true, errors: [] };
    }

    // 2. If effective rule set is empty, identity (H(s)=1)
    if (effectiveRules.length === 0) {
      return { valid: true, errors: [] };
    }

    // 3. Build a fieldsMetadata lookup: Map<sectionName, string[]>
    const sectionFieldsMap = new Map<string, string[]>();
    for (const section of fieldsMetadata) {
      sectionFieldsMap.set(section.sectionName, section.fields);
    }

    // 4. Evaluate each rule
    const errors: ValidationError[] = [];

    for (const rule of effectiveRules) {
      for (const section of rule.sections) {
        // 4a. Look up the field list from fieldsMetadata by sectionName
        const sectionFields = sectionFieldsMap.get(section.sectionName);
        if (!sectionFields) {
          console.warn(
            `[ValidationEngine] Section "${section.sectionName}" not found in fieldsMetadata for rule "${rule.name}", skipping.`,
          );
          continue;
        }

        // 4b. Determine which fields have overrides
        const fieldOverrides = section.fieldOverrides || [];
        const overriddenFieldNames = new Set(
          fieldOverrides.map((o) => o.fieldName),
        );

        // 4e. Field overrides take PRIORITY — remove overridden fields from the list
        // passed to the section pattern evaluator
        const fieldsForPattern = sectionFields.filter(
          (f) => !overriddenFieldNames.has(f),
        );

        // 4c. For fields WITHOUT overrides: apply section pattern evaluator
        const patternEvaluator = getPatternEvaluator(section.pattern);
        const patternConfig = {
          ...section.patternConfig,
          sectionName: section.sectionName,
          ruleName: rule.name,
          ruleType: rule.source,
        };
        const patternErrors = patternEvaluator(
          fieldsForPattern,
          responses,
          patternConfig,
          previousResponses,
        );
        errors.push(...patternErrors);

        // 4d. For fields WITH overrides: apply field evaluator
        for (const override of fieldOverrides) {
          // Skip fields not in fieldsMetadata for this section (graceful degradation)
          if (!sectionFields.includes(override.fieldName)) {
            console.warn(
              `[ValidationEngine] Field "${override.fieldName}" in override not found in section "${section.sectionName}" fields, skipping.`,
            );
            continue;
          }

          const fieldEvaluator = getFieldEvaluator(override.transferFunction);
          const fieldConfig = {
            ...override.config,
            sectionName: section.sectionName,
            ruleName: rule.name,
            ruleType: rule.source,
          };
          const fieldValue = responses[override.fieldName];
          const fieldError = fieldEvaluator(
            override.fieldName,
            fieldValue,
            fieldConfig,
            responses,
          );
          if (fieldError !== null) {
            errors.push(fieldError);
          }
        }
      }
    }

    // 5. Return result
    return { valid: errors.length === 0, errors };
  } catch (err) {
    // Top-level graceful degradation: if anything fails unexpectedly, H(s)=1
    console.error('[ValidationEngine] Unexpected error during validation, falling back to identity:', err);
    return { valid: true, errors: [] };
  }
}
