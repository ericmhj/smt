/**
 * Form Template Schemas - Zod validation schemas for form template CRUD endpoints.
 *
 * @module form-template.schemas
 * @requirements 16.1, 16.3
 */

import { z } from 'zod';

/**
 * Schema for creating a new form template.
 */
export const createFormTemplateSchema = z.object({
  form_type: z.string().min(1, 'form_type es requerido').max(50),
  name: z.string().min(1, 'name es requerido').max(255),
  description: z.string().optional(),
  html_content: z.string().min(1, 'html_content es requerido'),
});

/**
 * Schema for updating an existing form template (partial update).
 */
export const updateFormTemplateSchema = z.object({
  name: z.string().min(1, 'name es requerido').max(255).optional(),
  description: z.string().optional(),
  html_content: z.string().min(1, 'html_content es requerido').optional(),
});

/**
 * Schema for form template ID parameter (UUID).
 */
export const formTemplateIdParamSchema = z.object({
  id: z.string().uuid('id debe ser un UUID válido'),
});

// ─── Inferred Types ──────────────────────────────────────────────────────────

export type CreateFormTemplateInput = z.infer<typeof createFormTemplateSchema>;
export type UpdateFormTemplateInput = z.infer<typeof updateFormTemplateSchema>;
