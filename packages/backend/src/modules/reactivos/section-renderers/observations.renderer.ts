/**
 * Observations Section Renderer
 *
 * Renders all observations chronologically with styled cards.
 *
 * @module observations.renderer
 * @requirements 2.5
 */

import type { SectionRenderer } from './renderer.interface.js';
import type { TemplateSection, PdfRenderContext } from '../../report-templates/report-template.types.js';

export class ObservationsRenderer implements SectionRenderer {
  async render(
    doc: PDFKit.PDFDocument,
    section: TemplateSection,
    context: PdfRenderContext,
  ): Promise<void> {
    if (context.observations.length === 0) {
      doc.fontSize(10).font('Helvetica').fillColor('#64748b').text('Sin observaciones registradas.');
      doc.fillColor('#1e293b');
      doc.moveDown(1);
      return;
    }

    // Sort chronologically (oldest first)
    const sorted = [...context.observations].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    const startX = doc.x;

    for (const obs of sorted) {
      // Check if we need a new page
      if (doc.y > 750) {
        doc.addPage();
      }

      const obsY = doc.y;

      // Left accent bar
      doc.rect(startX, obsY, 3, 30).fill('#2563eb');

      // Date
      doc
        .fillColor('#64748b')
        .font('Helvetica-Oblique')
        .fontSize(8)
        .text(
          new Date(obs.date).toLocaleDateString('es-MX', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          }),
          startX + 10,
          obsY,
        );

      // Content
      doc
        .fillColor('#1e293b')
        .font('Helvetica')
        .fontSize(10)
        .text(obs.content, startX + 10, obsY + 12, { width: 480 });

      doc.y = Math.max(doc.y, obsY + 32);
      doc.moveDown(0.5);
    }

    doc.moveDown(0.5);
  }
}
