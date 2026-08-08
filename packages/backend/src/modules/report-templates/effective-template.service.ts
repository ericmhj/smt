/**
 * Effective Template Computation Service
 *
 * Computes the effective report template for a given reactivo by evaluating
 * the hierarchy: global template → tenant activation → form override.
 *
 * @module effective-template.service
 * @requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 */

import { eq, and } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import { getSqlClient } from '../../db/index.js';
import { reportTemplates } from '../../db/schema/index.js';
import type { EffectiveTemplateResult, TemplateSection } from './report-template.types.js';

export class EffectiveTemplateService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  /**
   * Computes the effective template for a given reactivo.
   * Hierarchy: global template → tenant activation → form override
   *
   * Returns { mode: 'legacy' } when any condition breaks the chain,
   * or { mode: 'template', sections } with the final active sections.
   */
  async compute(
    formType: string,
    tenantSchema: string,
    formId: string,
  ): Promise<EffectiveTemplateResult> {
    // Step 1: Find active template for form_type in public schema
    const [template] = await this.db
      .select()
      .from(reportTemplates)
      .where(
        and(
          eq(reportTemplates.formType, formType),
          eq(reportTemplates.isActive, true),
        ),
      )
      .limit(1);

    if (!template) {
      return { mode: 'legacy' };
    }

    // Step 2: Check if tenant has activated this template
    const sqlClient = getSqlClient();

    const activationResult = await sqlClient.unsafe(
      `SELECT id, theme_config FROM ${tenantSchema}.report_template_activations
       WHERE report_template_id = $1
       LIMIT 1`,
      [template.id],
    );

    if (!activationResult || activationResult.length === 0) {
      return { mode: 'legacy' };
    }

    const themeConfig = activationResult[0].theme_config as Record<string, unknown> | null;

    // Step 3: Check for form-specific override
    const overrideResult = await sqlClient.unsafe(
      `SELECT override_type, custom_sections FROM ${tenantSchema}.report_template_overrides
       WHERE form_id = $1 AND report_template_id = $2
       LIMIT 1`,
      [formId, template.id],
    );

    if (!overrideResult || overrideResult.length === 0) {
      // No override — use template sections as-is
      return { mode: 'template', sections: template.sections as TemplateSection[], themeConfig: themeConfig || undefined };
    }

    const override = overrideResult[0] as {
      override_type: string;
      custom_sections: TemplateSection[] | null;
    };

    if (override.override_type === 'deactivate') {
      return { mode: 'legacy' };
    }

    if (override.override_type === 'custom' && override.custom_sections) {
      return { mode: 'template', sections: override.custom_sections, themeConfig: themeConfig || undefined };
    }

    // Fallback to template sections
    return { mode: 'template', sections: template.sections as TemplateSection[], themeConfig: themeConfig || undefined };
  }
}
