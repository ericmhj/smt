/**
 * Section Renderer Interface
 *
 * Defines the contract for all PDF section renderers.
 * Each section type (static, form_content, signatures, etc.)
 * implements this interface.
 *
 * @module renderer.interface
 */

import type { TemplateSection, PdfRenderContext } from '../../report-templates/report-template.types.js';

export interface SectionRenderer {
  render(
    doc: PDFKit.PDFDocument,
    section: TemplateSection,
    context: PdfRenderContext,
  ): Promise<void>;
}
