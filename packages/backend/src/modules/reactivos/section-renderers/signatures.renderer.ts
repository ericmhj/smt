/**
 * Signatures Section Renderer
 *
 * Renders signature blocks for each configured role.
 *
 * @module signatures.renderer
 * @requirements 2.3
 */

import type { SectionRenderer } from './renderer.interface.js';
import type { TemplateSection, PdfRenderContext, SignaturesConfig } from '../../report-templates/report-template.types.js';

export class SignaturesRenderer implements SectionRenderer {
  async render(
    doc: PDFKit.PDFDocument,
    section: TemplateSection,
    _context: PdfRenderContext,
  ): Promise<void> {
    const config = section.config as SignaturesConfig;

    doc.fontSize(14).font('Helvetica-Bold').text(section.title, { underline: true });
    doc.moveDown(1);

    for (const role of config.roles) {
      doc.moveDown(2);
      const x = doc.x;
      const y = doc.y;
      doc.moveTo(x, y).lineTo(x + 200, y).stroke();
      doc.fontSize(10).font('Helvetica').text(role, { align: 'left' });
      doc.moveDown(1);
    }

    doc.moveDown(1);
  }
}
