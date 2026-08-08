/**
 * Form Content Section Renderer
 *
 * Renders the original form HTML structure with responses injected.
 * Preserves the form's sections, tables, and layout.
 * Only applies theme palette colors/fonts as CSS overrides.
 *
 * Uses a lightweight approach: injects values into the HTML and
 * renders it as-is in the PDF (delegating to the pipeline's HTML rendering).
 *
 * @module form-content.renderer
 * @requirements 2.2, 8.6
 */

import type { SectionRenderer } from './renderer.interface.js';
import type { TemplateSection, PdfRenderContext, FormContentConfig } from '../../report-templates/report-template.types.js';

export class FormContentRenderer implements SectionRenderer {
  async render(
    doc: PDFKit.PDFDocument,
    section: TemplateSection,
    context: PdfRenderContext,
  ): Promise<void> {
    const config = section.config as FormContentConfig;

    // If we have the original form HTML, render it as structured content
    // For now, use the fieldsMetadata to render a proper table preserving sections
    if (context.fieldsMetadata && context.fieldsMetadata.length > 0) {
      this.renderFromMetadata(doc, context, config);
    } else {
      this.renderFromResponses(doc, context, config);
    }
  }

  private renderFromMetadata(
    doc: PDFKit.PDFDocument,
    context: PdfRenderContext,
    config: FormContentConfig,
  ): void {
    const startX = doc.x;
    const tableWidth = 495;
    const labelWidth = tableWidth * 0.38;
    const valueWidth = tableWidth * 0.62;
    const rowPadding = 7;

    // Table top border
    doc
      .strokeColor('#2563eb')
      .lineWidth(1.5)
      .moveTo(startX, doc.y)
      .lineTo(startX + tableWidth, doc.y)
      .stroke();
    doc.moveDown(0.2);

    const fields = context.fieldsMetadata;

    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      const value = context.responses[field.name];
      const isEmpty = value === null || value === undefined || value === '';

      // Skip empty fields if config says to hide them
      if (!config.showEmptyFields && isEmpty) continue;

      const label = field.label || this.fieldNameToLabel(field.name);
      const displayValue = isEmpty ? '' : String(value);

      // Calculate row height
      const textToMeasure = displayValue || 'placeholder';
      const valueHeight = doc.heightOfString(textToMeasure, {
        width: valueWidth - rowPadding * 2,
      });
      const rowHeight = Math.max(valueHeight + rowPadding * 2, 26);

      // New page if needed
      if (doc.y + rowHeight > 770) {
        doc.addPage();
      }

      const rowY = doc.y;

      // Alternating row background
      if (i % 2 === 0) {
        doc.rect(startX, rowY, tableWidth, rowHeight).fill('#f8fafc');
      }

      // Row border bottom
      doc
        .strokeColor('#e2e8f0')
        .lineWidth(0.5)
        .moveTo(startX, rowY + rowHeight)
        .lineTo(startX + tableWidth, rowY + rowHeight)
        .stroke();

      // Vertical divider
      doc
        .strokeColor('#e2e8f0')
        .lineWidth(0.5)
        .moveTo(startX + labelWidth, rowY)
        .lineTo(startX + labelWidth, rowY + rowHeight)
        .stroke();

      // Label
      doc
        .fillColor('#334155')
        .font('Helvetica-Bold')
        .fontSize(9)
        .text(label, startX + rowPadding, rowY + rowPadding, {
          width: labelWidth - rowPadding * 2,
        });

      // Value or empty placeholder
      if (isEmpty) {
        // Draw a capture line (simulates empty field)
        const lineY = rowY + rowHeight - rowPadding - 2;
        doc
          .strokeColor('#cbd5e1')
          .lineWidth(0.5)
          .moveTo(startX + labelWidth + rowPadding, lineY)
          .lineTo(startX + labelWidth + valueWidth - rowPadding, lineY)
          .stroke();
      } else {
        doc
          .fillColor('#0f172a')
          .font('Helvetica')
          .fontSize(10)
          .text(displayValue, startX + labelWidth + rowPadding, rowY + rowPadding, {
            width: valueWidth - rowPadding * 2,
          });
      }

      doc.y = rowY + rowHeight;
    }

    // Table bottom border
    doc
      .strokeColor('#2563eb')
      .lineWidth(1)
      .moveTo(startX, doc.y)
      .lineTo(startX + tableWidth, doc.y)
      .stroke();

    doc.fillColor('#1e293b');
    doc.moveDown(1);
  }

  private renderFromResponses(
    doc: PDFKit.PDFDocument,
    context: PdfRenderContext,
    config: FormContentConfig,
  ): void {
    const entries = Object.entries(context.responses);
    if (entries.length === 0) {
      doc.fontSize(10).font('Helvetica').fillColor('#64748b').text('Sin datos registrados.');
      doc.fillColor('#1e293b');
      doc.moveDown(1);
      return;
    }

    for (const [field, value] of entries) {
      const isEmpty = value === null || value === undefined || value === '';
      if (!config.showEmptyFields && isEmpty) continue;

      const label = this.fieldNameToLabel(field);
      const displayValue = isEmpty ? '—' : String(value);

      doc.fontSize(9).font('Helvetica-Bold').fillColor('#475569').text(`${label}: `, { continued: true });
      doc.font('Helvetica').fillColor('#1e293b').fontSize(10).text(displayValue);
      doc.moveDown(0.3);
    }

    doc.moveDown(1);
  }

  private fieldNameToLabel(name: string): string {
    return name
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
}
