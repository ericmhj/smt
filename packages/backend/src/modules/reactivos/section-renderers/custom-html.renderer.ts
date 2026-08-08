/**
 * Custom HTML Section Renderer
 *
 * Renders free HTML content as plain text in the PDF.
 * Strips HTML tags and renders the text content.
 *
 * @module custom-html.renderer
 * @requirements 2.4
 */

import type { SectionRenderer } from './renderer.interface.js';
import type { TemplateSection, PdfRenderContext, CustomHtmlConfig } from '../../report-templates/report-template.types.js';

export class CustomHtmlRenderer implements SectionRenderer {
  async render(
    doc: PDFKit.PDFDocument,
    section: TemplateSection,
    _context: PdfRenderContext,
  ): Promise<void> {
    const config = section.config as CustomHtmlConfig;

    doc.fontSize(14).font('Helvetica-Bold').text(section.title, { underline: true });
    doc.moveDown(0.5);

    // Strip HTML tags and render as plain text
    const plainText = config.htmlContent.replace(/<[^>]*>/g, '');
    doc.fontSize(11).font('Helvetica').text(plainText);
    doc.moveDown(1);
  }
}
