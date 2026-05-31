import PDFDocument from 'pdfkit';
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

  /**
   * Generate a PDF document for a reactivo with all related data.
   */
  async generate(reactivoId: string): Promise<Buffer> {
    // Fetch reactivo
    const reactivoResult = await this.db
      .select({
        id: reactivos.id,
        formId: reactivos.formId,
        formVersionId: reactivos.formVersionId,
        tecnicoId: reactivos.tecnicoId,
        attemptNumber: reactivos.attemptNumber,
        state: reactivos.state,
        responses: reactivos.responses,
        rejectionReason: reactivos.rejectionReason,
        createdAt: reactivos.createdAt,
      })
      .from(reactivos)
      .where(eq(reactivos.id, reactivoId))
      .limit(1);

    const reactivo = reactivoResult[0];
    if (!reactivo) {
      throw new ReactivoError(
        404,
        ReactivoErrorCode.REACTIVO_NOT_FOUND,
        'Reactivo no encontrado',
      );
    }

    // Fetch form
    const formResult = await this.db
      .select({ name: forms.name })
      .from(forms)
      .where(eq(forms.id, reactivo.formId))
      .limit(1);

    const form = formResult[0];

    // Fetch form version
    const versionResult = await this.db
      .select({ versionNumber: formVersions.versionNumber })
      .from(formVersions)
      .where(eq(formVersions.id, reactivo.formVersionId))
      .limit(1);

    const version = versionResult[0];

    // Fetch technician
    const tecnicoResult = await this.db
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, reactivo.tecnicoId))
      .limit(1);

    const tecnico = tecnicoResult[0];

    // Fetch state transitions
    const transitions = await this.db
      .select({
        fromState: stateTransitions.fromState,
        toState: stateTransitions.toState,
        actorId: stateTransitions.actorId,
        reason: stateTransitions.reason,
        createdAt: stateTransitions.createdAt,
      })
      .from(stateTransitions)
      .where(eq(stateTransitions.reactivoId, reactivoId))
      .orderBy(stateTransitions.createdAt);

    // Fetch observations
    const observationResults = await this.db
      .select({
        id: observations.id,
        content: observations.content,
        createdAt: observations.createdAt,
        authorId: observations.authorId,
      })
      .from(observations)
      .where(eq(observations.reactivoId, reactivoId))
      .orderBy(observations.createdAt);

    // Fetch observation files
    const obsFileResults =
      observationResults.length > 0
        ? await this.db
            .select({
              observationId: observationFiles.observationId,
              originalName: observationFiles.originalName,
            })
            .from(observationFiles)
        : [];

    // Build PDF
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(18).font('Helvetica-Bold').text('Reporte de Reactivo', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(12).font('Helvetica');
      doc.text(`Formulario: ${form?.name ?? 'N/A'}`, { align: 'center' });
      doc.text(`Versión: ${version?.versionNumber ?? 'N/A'}`, { align: 'center' });
      doc.text(`Fecha: ${reactivo.createdAt.toISOString().split('T')[0]}`, { align: 'center' });
      doc.moveDown(1);

      // Separator
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.5);

      // Section: Technician info
      doc.fontSize(14).font('Helvetica-Bold').text('Información del Técnico');
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica');
      doc.text(`Nombre: ${tecnico?.name ?? 'N/A'}`);
      doc.text(`Email: ${tecnico?.email ?? 'N/A'}`);
      doc.moveDown(1);

      // Section: Current state and attempt
      doc.fontSize(14).font('Helvetica-Bold').text('Estado Actual');
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica');
      doc.text(`Estado: ${STATE_LABELS[reactivo.state as ReactivoState] ?? reactivo.state}`);
      doc.text(`Número de intento: ${reactivo.attemptNumber}`);
      doc.moveDown(1);

      // Section: Responses
      doc.fontSize(14).font('Helvetica-Bold').text('Respuestas');
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica');
      const responses = reactivo.responses as Record<string, unknown>;
      for (const [key, value] of Object.entries(responses)) {
        const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
        doc.text(`${key}: ${displayValue}`);
      }
      doc.moveDown(1);

      // Section: Rejection reason (if applicable)
      if (reactivo.rejectionReason) {
        doc.fontSize(14).font('Helvetica-Bold').text('Motivo de Rechazo');
        doc.moveDown(0.3);
        doc.fontSize(10).font('Helvetica');
        doc.text(reactivo.rejectionReason);
        doc.moveDown(1);
      }

      // Section: State history
      if (transitions.length > 0) {
        doc.fontSize(14).font('Helvetica-Bold').text('Historial de Estados');
        doc.moveDown(0.3);
        doc.fontSize(10).font('Helvetica');
        for (const t of transitions) {
          const from = STATE_LABELS[t.fromState as ReactivoState] ?? t.fromState;
          const to = STATE_LABELS[t.toState as ReactivoState] ?? t.toState;
          const date = t.createdAt.toISOString().split('T')[0];
          let line = `${date}: ${from} → ${to} (Actor: ${t.actorId})`;
          if (t.reason) {
            line += ` — Motivo: ${t.reason}`;
          }
          doc.text(line);
        }
        doc.moveDown(1);
      }

      // Section: Observations
      if (observationResults.length > 0) {
        doc.fontSize(14).font('Helvetica-Bold').text('Observaciones');
        doc.moveDown(0.3);
        doc.fontSize(10).font('Helvetica');
        for (const obs of observationResults) {
          const date = obs.createdAt.toISOString().split('T')[0];
          doc.text(`[${date}] ${obs.content}`);

          // List attached files
          const files = obsFileResults.filter((f) => f.observationId === obs.id);
          if (files.length > 0) {
            doc.text(`  Archivos adjuntos: ${files.map((f) => f.originalName).join(', ')}`);
          }
        }
      }

      doc.end();
    });
  }
}
