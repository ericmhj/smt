/**
 * Report Templates Engine - Zod Schemas
 *
 * Zod validation schemas for API payloads: report template CRUD,
 * activation management, override management, and section-level validation.
 *
 * @module report-template.schemas
 * @requirements 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7
 */

import { z } from 'zod';

// ─── Section Type Enum ───────────────────────────────────────────────────────

const sectionTypeValues = [
  'static',
  'form_content',
  'signatures',
  'custom_html',
  'observations',
  'state_history',
] as const;

// ─── Type-Specific Config Schemas ────────────────────────────────────────────

const staticConfigSchema = z.object({
  content: z.string().min(1, 'content es requerido para sección static'),
});

const formContentConfigSchema = z.object({
  showEmptyFields: z.boolean({
    required_error: 'showEmptyFields es requerido para sección form_content',
  }),
});

const signaturesConfigSchema = z.object({
  roles: z
    .array(z.string().min(1))
    .min(1, 'Se requiere al menos un rol en sección signatures'),
});

const customHtmlConfigSchema = z.object({
  htmlContent: z.string().min(1, 'htmlContent es requerido para sección custom_html'),
});

const emptyConfigSchema = z.object({}).passthrough();

// ─── Template Section Schema ─────────────────────────────────────────────────

/**
 * Schema for a single section within a report template.
 * Uses superRefine to validate config shape based on section type.
 */
export const templateSectionSchema = z
  .object({
    id: z.string().uuid('id debe ser UUID'),
    type: z.enum(sectionTypeValues, {
      errorMap: () => ({ message: 'type debe ser un tipo de sección válido' }),
    }),
    title: z.string().min(1, 'title es requerido'),
    order: z.number().int().min(0),
    is_active: z.boolean(),
    config: z.record(z.unknown()),
  })
  .superRefine((section, ctx) => {
    let result;
    switch (section.type) {
      case 'static':
        result = staticConfigSchema.safeParse(section.config);
        break;
      case 'form_content':
        result = formContentConfigSchema.safeParse(section.config);
        break;
      case 'signatures':
        result = signaturesConfigSchema.safeParse(section.config);
        break;
      case 'custom_html':
        result = customHtmlConfigSchema.safeParse(section.config);
        break;
      case 'observations':
      case 'state_history':
        result = emptyConfigSchema.safeParse(section.config);
        break;
    }
    if (result && !result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({ ...issue, path: ['config', ...issue.path] });
      }
    }
  });

// ─── Report Template Schemas ─────────────────────────────────────────────────

/**
 * Schema for creating a new report template.
 */
export const createReportTemplateSchema = z.object({
  form_type: z.string().min(1).max(50).nullable().optional(),
  name: z.string().min(1, 'name es requerido').max(255),
  description: z.string().optional(),
  sections: z
    .array(templateSectionSchema)
    .min(1, 'Se requiere al menos una sección'),
  tenant_slug: z.string().min(1).max(50).nullable().optional(),
  tenant_form_id: z.string().uuid().nullable().optional(),
  parent_template_id: z.string().uuid().nullable().optional(),
});

/**
 * Schema for updating an existing report template (partial update).
 */
export const updateReportTemplateSchema = z.object({
  form_type: z.string().min(1).max(50).nullable().optional(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  sections: z
    .array(templateSectionSchema)
    .min(1, 'Se requiere al menos una sección')
    .optional(),
  tenant_slug: z.string().min(1).max(50).nullable().optional(),
  tenant_form_id: z.string().uuid().nullable().optional(),
  parent_template_id: z.string().uuid().nullable().optional(),
});

// ─── Activation Schema ───────────────────────────────────────────────────────

/**
 * Schema for creating a report template activation.
 */
export const createActivationSchema = z.object({
  report_template_id: z.string().uuid('report_template_id debe ser un UUID válido'),
});

// ─── Override Schema ─────────────────────────────────────────────────────────

/**
 * Schema for creating a report template override.
 */
export const createOverrideSchema = z
  .object({
    report_template_id: z.string().uuid('report_template_id debe ser un UUID válido'),
    override_type: z.enum(['deactivate', 'custom'], {
      errorMap: () => ({
        message: "override_type debe ser 'deactivate' o 'custom'",
      }),
    }),
    custom_sections: z.array(templateSectionSchema).optional(),
  })
  .refine(
    (data) =>
      data.override_type !== 'custom' ||
      (data.custom_sections && data.custom_sections.length > 0),
    {
      message: 'custom_sections es requerido cuando override_type es "custom"',
      path: ['custom_sections'],
    },
  );

// ─── Inferred Types ──────────────────────────────────────────────────────────

export type CreateReportTemplateInput = z.infer<typeof createReportTemplateSchema>;
export type UpdateReportTemplateInput = z.infer<typeof updateReportTemplateSchema>;
export type CreateActivationInput = z.infer<typeof createActivationSchema>;
export type CreateOverrideInput = z.infer<typeof createOverrideSchema>;
export type TemplateSectionInput = z.infer<typeof templateSectionSchema>;
