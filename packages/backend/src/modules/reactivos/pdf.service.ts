import puppeteer from 'puppeteer';
import { eq } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import { reactivos, stateTransitions } from '../../db/schema/reactivos.js';
import { forms, formVersions } from '../../db/schema/forms.js';
import { users } from '../../db/schema/users.js';
import { observations, observationFiles } from '../../db/schema/observations.js';
import { ReactivoError, ReactivoErrorCode } from './reactivo.errors.js';
import type { ReactivoState } from './reactivo.types.js';

const STATE_LABELS: Record<ReactivoState, string> = {
  pendiente: 'Pendiente',
  en_revision: 'En Revisión',
  validado: 'Validado',
  rechazado: 'Rechazado',
  finalizado: 'Finalizado',
};

export class PDFService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async generate(reactivoId: string): Promise<Buffer> {
    // Fetch reactivo
    const reactivoResult = await this.db
      .select()
      .from(reactivos)
      .where(eq(reactivos.id, reactivoId))
      .limit(1);

    const reactivo = reactivoResult[0];
    if (!reactivo) {
      throw new ReactivoError(404, ReactivoErrorCode.REACTIVO_NOT_FOUND, 'Reactivo no encontrado');
    }

    // Fetch form version (HTML template)
    const versionResult = await this.db
      .select()
      .from(formVersions)
      .where(eq(formVersions.id, reactivo.formVersionId))
      .limit(1);

    const version = versionResult[0];

    // Fetch form name
    const formResult = await this.db
      .select({ name: forms.name })
      .from(forms)
      .where(eq(forms.id, reactivo.formId))
      .limit(1);

    // Fetch technician
    const tecnicoResult = await this.db
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, reactivo.tecnicoId))
      .limit(1);

    // Fetch state transitions
    const transitions = await this.db
      .select()
      .from(stateTransitions)
      .where(eq(stateTransitions.reactivoId, reactivoId))
      .orderBy(stateTransitions.createdAt);

    // Fetch observations
    const observationResults = await this.db
      .select()
      .from(observations)
      .where(eq(observations.reactivoId, reactivoId))
      .orderBy(observations.createdAt);

    // Build the HTML for PDF rendering
    const responses = reactivo.responses as Record<string, unknown>;
    const formHtml = version?.htmlContent || '<p>Sin contenido</p>';

    // Inject responses into the form HTML
    const filledFormHtml = this.injectResponses(formHtml, responses);

    // Build complete HTML document
    const fullHtml = this.buildPdfHtml({
      formName: formResult[0]?.name || 'Formulario',
      tecnicoName: tecnicoResult[0]?.name || 'N/A',
      tecnicoEmail: tecnicoResult[0]?.email || 'N/A',
      state: STATE_LABELS[reactivo.state as ReactivoState] || reactivo.state,
      attemptNumber: reactivo.attemptNumber,
      rejectionReason: reactivo.rejectionReason,
      createdAt: reactivo.createdAt.toISOString(),
      filledFormHtml,
      transitions: transitions.map(t => ({
        from: STATE_LABELS[t.fromState as ReactivoState] || t.fromState,
        to: STATE_LABELS[t.toState as ReactivoState] || t.toState,
        reason: t.reason,
        date: t.createdAt.toISOString(),
      })),
      observations: observationResults.map(o => ({
        content: o.content,
        date: o.createdAt.toISOString(),
      })),
    });

    // Generate PDF with Puppeteer
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(fullHtml, { waitUntil: 'networkidle0' });
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
      });
      return Buffer.from(pdfBuffer);
    } finally {
      await browser.close();
    }
  }

  private injectResponses(html: string, responses: Record<string, unknown>): string {
    let result = html;

    for (const [name, value] of Object.entries(responses)) {
      // Set input values
      const inputRegex = new RegExp(`(<input[^>]*name=["']${name}["'][^>]*?)(/?>)`, 'gi');
      result = result.replace(inputRegex, (match, before, close) => {
        // Remove existing value attribute
        const cleaned = before.replace(/\s+value=["'][^"']*["']/gi, '');
        return `${cleaned} value="${String(value)}" disabled${close}`;
      });

      // Set textarea content
      const textareaRegex = new RegExp(`(<textarea[^>]*name=["']${name}["'][^>]*>)(.*?)(</textarea>)`, 'gis');
      result = result.replace(textareaRegex, `$1${String(value)}$3`);

      // Set select option selected
      const selectRegex = new RegExp(`(<select[^>]*name=["']${name}["'][^>]*>)(.*?)(</select>)`, 'gis');
      result = result.replace(selectRegex, (match, open, options, close) => {
        const updatedOptions = options.replace(
          new RegExp(`(<option[^>]*value=["']${String(value)}["'][^>]*?)(/?>)`, 'gi'),
          '$1 selected$2'
        );
        return `${open}${updatedOptions}${close}`;
      });
    }

    return result;
  }

  private buildPdfHtml(data: {
    formName: string;
    tecnicoName: string;
    tecnicoEmail: string;
    state: string;
    attemptNumber: number;
    rejectionReason: string | null;
    createdAt: string;
    filledFormHtml: string;
    transitions: Array<{ from: string; to: string; reason: string | null; date: string }>;
    observations: Array<{ content: string; date: string }>;
  }): string {
    const date = new Date(data.createdAt).toLocaleDateString('es-MX');

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #333; }
    .pdf-header { border-bottom: 2px solid #2563eb; padding-bottom: 10px; margin-bottom: 20px; }
    .pdf-header h1 { margin: 0; font-size: 18px; color: #2563eb; }
    .pdf-meta { display: flex; justify-content: space-between; font-size: 12px; color: #666; margin-top: 5px; }
    .pdf-section { margin: 20px 0; }
    .pdf-section h2 { font-size: 14px; color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; }
    .pdf-info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px; }
    .pdf-info-grid dt { font-weight: 600; color: #475569; }
    .pdf-info-grid dd { margin: 0; }
    .form-content { border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 15px 0; }
    .pdf-history { font-size: 11px; }
    .pdf-history table { width: 100%; border-collapse: collapse; }
    .pdf-history th, .pdf-history td { border: 1px solid #e2e8f0; padding: 4px 8px; text-align: left; }
    .pdf-history th { background: #f8fafc; }
    .pdf-rejection { background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 10px; margin: 10px 0; }
    .pdf-observations { font-size: 12px; }
    .pdf-observations .obs-item { border-left: 3px solid #2563eb; padding-left: 10px; margin: 8px 0; }
    .state-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; background: #e2e8f0; }
  </style>
</head>
<body>
  <div class="pdf-header">
    <h1>${data.formName}</h1>
    <div class="pdf-meta">
      <span>Técnico: ${data.tecnicoName} (${data.tecnicoEmail})</span>
      <span>Fecha: ${date} | Intento #${data.attemptNumber}</span>
    </div>
    <div class="pdf-meta">
      <span>Estado: <span class="state-badge">${data.state}</span></span>
    </div>
  </div>

  ${data.rejectionReason ? `
  <div class="pdf-rejection">
    <strong>Motivo de rechazo:</strong> ${data.rejectionReason}
  </div>` : ''}

  <div class="pdf-section">
    <h2>Formulario Completado</h2>
    <div class="form-content">
      ${data.filledFormHtml}
    </div>
  </div>

  ${data.transitions.length > 0 ? `
  <div class="pdf-section pdf-history">
    <h2>Historial de Estados</h2>
    <table>
      <thead><tr><th>Fecha</th><th>Transición</th><th>Motivo</th></tr></thead>
      <tbody>
        ${data.transitions.map(t => `<tr><td>${new Date(t.date).toLocaleDateString('es-MX')}</td><td>${t.from} → ${t.to}</td><td>${t.reason || '-'}</td></tr>`).join('')}
      </tbody>
    </table>
  </div>` : ''}

  ${data.observations.length > 0 ? `
  <div class="pdf-section pdf-observations">
    <h2>Observaciones</h2>
    ${data.observations.map(o => `<div class="obs-item"><small>${new Date(o.date).toLocaleDateString('es-MX')}</small><p>${o.content}</p></div>`).join('')}
  </div>` : ''}
</body>
</html>`;
  }
}
