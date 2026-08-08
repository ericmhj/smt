/**
 * Static Section Renderer
 *
 * Renders fixed content (cover page, headers, etc.) from config.content.
 *
 * @module static.renderer
 * @requirements 2.1
 */

import type { SectionRenderer } from './renderer.interface.js';
import type { TemplateSection, PdfRenderContext, StaticConfig } from '../../report-templates/report-template.types.js';

export class StaticRenderer implements SectionRenderer {
  async render(
    doc: PDFKit.PDFDocument,
    section: TemplateSection,
    _context: PdfRenderContext,
  ): Promise<void> {
    const config = section.config as StaticConfig;

    if (!config.content) {
      return;
    }

    doc
      .fillColor('#334155')
      .font('Helvetica')
      .fontSize(11)
      .text(config.content, { width: 495, lineGap: 3 });

    doc.moveDown(1);
  }
}
