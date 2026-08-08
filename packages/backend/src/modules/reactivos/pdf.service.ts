/**
 * PDF Service (Dispatcher)
 *
 * Orchestrates PDF generation by computing the effective template
 * and delegating to either the PDFKit pipeline or the legacy Puppeteer service.
 *
 * @module pdf.service
 * @requirements 8.1, 11.1, 11.3, 11.6, 14.1, 14.2, 14.3
 */

import { eq } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import { reactivos } from '../../db/schema/reactivos.js';
import { forms, formVersions } from '../../db/schema/forms.js';
import { users } from '../../db/schema/users.js';
import { stateTransitions } from '../../db/schema/reactivos.js';
import { observations } from '../../db/schema/observations.js';
import { EffectiveTemplateService } from '../report-templates/effective-template.service.js';
import { PdfPipelineService } from './pdf-pipeline.service.js';
import { PdfLegacyService } from './pdf-legacy.service.js';
import { ReactivoError, ReactivoErrorCode } from './reactivo.errors.js';
import type { ReactivoState } from './reactivo.types.js';
import type { PdfRenderContext } from '../report-templates/report-template.types.js';

const STATE_LABELS: Record<ReactivoState, string> = {
  pendiente: 'Pendiente',
  en_revision: 'En Revisión',
  validado: 'Validado',
  rechazado: 'Rechazado',
  finalizado: 'Finalizado',
};

export class PDFService {
  private db: Database;
  private effectiveTemplate: EffectiveTemplateService;
  private pipeline: PdfPipelineService;
  private legacy: PdfLegacyService;

  constructor(db: Database) {
    this.db = db;
    this.effectiveTemplate = new EffectiveTemplateService(db);
    this.pipeline = new PdfPipelineService();
    this.legacy = new PdfLegacyService(db);
  }

  async generate(reactivoId: string, tenantSchema?: string): Promise<Buffer> {
    // If no tenant schema provided, use legacy directly
    if (!tenantSchema) {
      return this.legacy.generate(reactivoId);
    }

    // Fetch reactivo to get form info
    const [reactivo] = await this.db
      .select()
      .from(reactivos)
      .where(eq(reactivos.id, reactivoId))
      .limit(1);

    if (!reactivo) {
      throw new ReactivoError(404, ReactivoErrorCode.REACTIVO_NOT_FOUND, 'Reactivo no encontrado');
    }

    // Get form type
    const [form] = await this.db
      .select({ name: forms.name, formType: forms.formType })
      .from(forms)
      .where(eq(forms.id, reactivo.formId))
      .limit(1);

    if (!form?.formType) {
      // No form type — use legacy
      return this.legacy.generate(reactivoId);
    }

    // Compute effective template
    let result;
    try {
      result = await this.effectiveTemplate.compute(
        form.formType,
        tenantSchema,
        reactivo.formId,
      );
    } catch (error) {
      console.error('[PDFService] Error computing effective template, falling back to legacy:', error);
      return this.legacy.generate(reactivoId);
    }

    if (result.mode === 'legacy') {
      return this.legacy.generate(reactivoId);
    }

    // Build render context and use pipeline
    try {
      const context = await this.buildRenderContext(reactivo, form.name);
      return await this.pipeline.generate(result.sections, context, result.themeConfig);
    } catch (error) {
      console.error('[PDFService] Error in PDFKit pipeline, falling back to legacy:', error);
      return this.legacy.generate(reactivoId);
    }
  }

  private async buildRenderContext(
    reactivo: any,
    formName: string,
  ): Promise<PdfRenderContext> {
    // Fetch technician
    const [tecnico] = await this.db
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, reactivo.tecnicoId))
      .limit(1);

    // Fetch form version metadata (field labels) and HTML
    const [formVersion] = await this.db
      .select({
        fieldsMetadata: formVersions.fieldsMetadata,
        htmlContent: formVersions.htmlContent,
      })
      .from(formVersions)
      .where(eq(formVersions.id, reactivo.formVersionId))
      .limit(1);

    const fieldsMetadata = (formVersion?.fieldsMetadata as Array<{ name: string; type?: string; label?: string; required?: boolean }>) || [];
    const formHtml = formVersion?.htmlContent || '';

    // Fetch state transitions
    const transitionsResult = await this.db
      .select()
      .from(stateTransitions)
      .where(eq(stateTransitions.reactivoId, reactivo.id))
      .orderBy(stateTransitions.createdAt);

    // Fetch observations
    const observationResults = await this.db
      .select()
      .from(observations)
      .where(eq(observations.reactivoId, reactivo.id))
      .orderBy(observations.createdAt);

    return {
      formName,
      tecnicoName: tecnico?.name || 'N/A',
      tecnicoEmail: tecnico?.email || 'N/A',
      state: STATE_LABELS[reactivo.state as ReactivoState] || reactivo.state,
      attemptNumber: reactivo.attemptNumber,
      rejectionReason: reactivo.rejectionReason,
      createdAt: reactivo.createdAt.toISOString(),
      responses: (reactivo.responses as Record<string, unknown>) || {},
      fieldsMetadata,
      formHtml,
      transitions: transitionsResult.map((t) => ({
        from: STATE_LABELS[t.fromState as ReactivoState] || t.fromState,
        to: STATE_LABELS[t.toState as ReactivoState] || t.toState,
        reason: t.reason,
        date: t.createdAt.toISOString(),
      })),
      observations: observationResults.map((o) => ({
        content: o.content,
        date: o.createdAt.toISOString(),
      })),
    };
  }
}
