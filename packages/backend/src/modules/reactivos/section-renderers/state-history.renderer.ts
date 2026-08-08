/**
 * State History Section Renderer
 *
 * Renders the state transition history as a table with date, transition, and reason.
 *
 * @module state-history.renderer
 * @requirements 2.6
 */

import type { SectionRenderer } from './renderer.interface.js';
import type { TemplateSection, PdfRenderContext } from '../../report-templates/report-template.types.js';

export class StateHistoryRenderer implements SectionRenderer {
  async render(
    doc: PDFKit.PDFDocument,
    section: TemplateSection,
    context: PdfRenderContext,
  ): Promise<void> {
    doc.fontSize(14).font('Helvetica-Bold').text(section.title, { underline: true });
    doc.moveDown(0.5);

    if (context.transitions.length === 0) {
      doc.fontSize(10).font('Helvetica').text('Sin historial de transiciones.');
      doc.moveDown(1);
      return;
    }

    const startX = doc.x;

    // Table header
    doc.fontSize(9).font('Helvetica-Bold');
    const headerY = doc.y;
    doc.text('Fecha', startX, headerY, { width: 80 });
    doc.text('Transición', startX + 85, headerY, { width: 200 });
    doc.text('Motivo', startX + 290, headerY, { width: 180 });
    doc.moveDown(0.5);

    // Separator line
    doc.moveTo(startX, doc.y).lineTo(startX + 470, doc.y).stroke();
    doc.moveDown(0.3);

    // Table rows
    doc.font('Helvetica').fontSize(9);
    for (const t of context.transitions) {
      const rowY = doc.y;
      doc.text(new Date(t.date).toLocaleDateString('es-MX'), startX, rowY, { width: 80 });
      doc.text(`${t.from} → ${t.to}`, startX + 85, rowY, { width: 200 });
      doc.text(t.reason || '—', startX + 290, rowY, { width: 180 });
      doc.moveDown(0.3);
    }

    doc.moveDown(1);
  }
}
