/**
 * Report Templates Engine - Type Definitions
 *
 * Core TypeScript types for the configurable report template system.
 * Templates define the PDF structure generated per form_type.
 *
 * @module report-template.types
 * @requirements 1.4, 2.1–2.6
 */

// ─── Section Types ───────────────────────────────────────────────────────────

/**
 * Available section types for a report template.
 * - `static`: Fixed content (cover page, headers, footers)
 * - `form_content`: Renders form field values from responses
 * - `signatures`: Displays signature blocks for approval chain
 * - `custom_html`: Free HTML content defined by platform admin
 * - `observations`: Reviewer observations/notes
 * - `state_history`: State transition history table
 */
export type SectionType =
  | 'static'
  | 'form_content'
  | 'signatures'
  | 'custom_html'
  | 'observations'
  | 'state_history';

// ─── Section Config Types ────────────────────────────────────────────────────

export interface StaticConfig {
  content: string; // Markdown basic support
}

export interface FormContentConfig {
  showEmptyFields: boolean;
}

export interface SignaturesConfig {
  roles: string[]; // e.g., ["técnico", "supervisor"]
}

export interface CustomHtmlConfig {
  htmlContent: string;
}

export interface ObservationsConfig {}

export interface StateHistoryConfig {}

export type SectionConfig =
  | StaticConfig
  | FormContentConfig
  | SignaturesConfig
  | CustomHtmlConfig
  | ObservationsConfig
  | StateHistoryConfig;

// ─── Template Section ────────────────────────────────────────────────────────

/**
 * A single configurable section within a report template.
 */
export interface TemplateSection {
  id: string; // UUID
  type: SectionType;
  title: string;
  order: number;
  is_active: boolean;
  config: SectionConfig;
}

// ─── Report Template ─────────────────────────────────────────────────────────

/**
 * A globally defined report template associated with a form type.
 * Stored in `public.report_templates`.
 */
export interface ReportTemplate {
  id: string;
  formType: string | null;
  name: string;
  description: string | null;
  isActive: boolean;
  sections: TemplateSection[];
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Template Activation ─────────────────────────────────────────────────────

/**
 * Record indicating a tenant has explicitly activated a report template.
 * Stored in `{tenant_schema}.report_template_activations`.
 */
export interface TemplateActivation {
  id: string;
  reportTemplateId: string;
  activatedBy: string;
  activatedAt: string;
}

// ─── Template Override ────────────────────────────────────────────────────────

/**
 * A per-tenant override for a specific form instance.
 * Stored in `{tenant_schema}.report_template_overrides`.
 */
export interface TemplateOverride {
  id: string;
  formId: string;
  reportTemplateId: string;
  overrideType: 'deactivate' | 'custom';
  customSections: TemplateSection[] | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Effective Template Result ───────────────────────────────────────────────

/**
 * Result of computing the effective template for a given reactivo.
 * Either falls back to legacy PDF generation or uses the template sections.
 */
export type EffectiveTemplateResult =
  | { mode: 'legacy' }
  | { mode: 'template'; sections: TemplateSection[]; themeConfig?: Record<string, unknown> };

// ─── PDF Pipeline Context ────────────────────────────────────────────────────

/**
 * Context data required by the PDF pipeline to render sections.
 * Built from the reactivo and its related entities.
 */
export interface PdfRenderContext {
  formName: string;
  tecnicoName: string;
  tecnicoEmail: string;
  state: string;
  attemptNumber: number;
  rejectionReason: string | null;
  createdAt: string;
  responses: Record<string, unknown>;
  fieldsMetadata: Array<{ name: string; type?: string; label?: string; required?: boolean }>;
  formHtml: string; // The original HTML of the form (with structure, sections, tables)
  transitions: Array<{
    from: string;
    to: string;
    reason: string | null;
    date: string;
  }>;
  observations: Array<{
    content: string;
    date: string;
  }>;
}
