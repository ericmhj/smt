/**
 * PDF Pipeline Service (Puppeteer + Theme)
 *
 * Generates themed PDF reports using Puppeteer.
 * Renders the original form HTML with responses injected,
 * applies theme colors/fonts as CSS, and adds report sections
 * (header, observations, state history, signatures) as HTML.
 *
 * @module pdf-pipeline.service
 */

import puppeteer from 'puppeteer';
import type { TemplateSection, PdfRenderContext } from '../report-templates/report-template.types.js';
import { renderFormForPdf } from './pdf-form-renderer.js';

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export interface ThemeStyles {
  primaryColor: string;
  primaryLight: string;
  primaryDark: string;
  textColor: string;
  neutralColor: string;
  backgroundColor: string;
  fontFamily: string;
  titleSize: number;
  bodySize: number;
  tableStyle: string;
  headerStyle: string;
}

const DEFAULT_THEME: ThemeStyles = {
  primaryColor: '#2563eb',
  primaryLight: '#dbeafe',
  primaryDark: '#1e40af',
  textColor: '#1e293b',
  neutralColor: '#64748b',
  backgroundColor: '#ffffff',
  fontFamily: 'Segoe UI, Helvetica, Arial, sans-serif',
  titleSize: 14,
  bodySize: 11,
  tableStyle: 'bordered',
  headerStyle: 'full',
};

function parseThemeConfig(themeConfig?: Record<string, unknown>): ThemeStyles {
  if (!themeConfig) return DEFAULT_THEME;
  const palette = themeConfig.palette as Record<string, string> | undefined;
  const typography = themeConfig.typography as Record<string, unknown> | undefined;
  const layout = themeConfig.layout as Record<string, string> | undefined;

  return {
    primaryColor: palette?.primary || DEFAULT_THEME.primaryColor,
    primaryLight: palette?.primaryLight || DEFAULT_THEME.primaryLight,
    primaryDark: palette?.primaryDark || DEFAULT_THEME.primaryDark,
    textColor: palette?.text || DEFAULT_THEME.textColor,
    neutralColor: palette?.neutral || DEFAULT_THEME.neutralColor,
    backgroundColor: palette?.background || DEFAULT_THEME.backgroundColor,
    fontFamily: (typography?.fontFamily as string) || DEFAULT_THEME.fontFamily,
    titleSize: (typography?.titleSize as number) || DEFAULT_THEME.titleSize,
    bodySize: (typography?.bodySize as number) || DEFAULT_THEME.bodySize,
    tableStyle: layout?.tableStyle || DEFAULT_THEME.tableStyle,
    headerStyle: layout?.headerStyle || DEFAULT_THEME.headerStyle,
  };
}

export class PdfPipelineService {
  async generate(
    sections: TemplateSection[],
    context: PdfRenderContext,
    themeConfig?: Record<string, unknown>,
  ): Promise<Buffer> {
    const theme = parseThemeConfig(themeConfig);
    const activeSections = sections.filter((s) => s.is_active).sort((a, b) => a.order - b.order);

    // Check if we have pre-rendered HTML from the form submission
    const renderedHtml = context.responses?.['__rendered_html'] as string | undefined;
    const canvasImage = context.responses?.['__canvas_image'] as string | undefined;

    let html: string;
    if (renderedHtml) {
      // Use the exact HTML the user saw — just replace canvas with image
      html = renderedHtml;
      if (canvasImage) {
        html = html.replace(
          /<div id="konva-stage">[\s\S]*?<\/div>/,
          `<img src="${canvasImage}" style="width:100%;max-width:760px;" />`,
        );
      }
      // Remove buttons
      html = html.replace(/<button[^>]*>[\s\S]*?<\/button>/gi, '');
    } else {
      // Build the full HTML document from template sections
      html = this.buildThemedHtml(activeSections, context, theme, themeConfig);
    }

    // Render with Puppeteer
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    // Page margins from theme config
    const pageMargins = this.getPageMargins(themeConfig);

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pageSize = this.getPageSize(themeConfig);
      const pdfBuffer = await page.pdf({
        format: pageSize as any,
        printBackground: true,
        margin: pageMargins,
      });
      return Buffer.from(pdfBuffer);
    } finally {
      await browser.close();
    }
  }

  private getPageMargins(themeConfig?: Record<string, unknown>): { top: string; bottom: string; left: string; right: string } {
    const defaults = { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' };
    if (!themeConfig) return defaults;

    const layout = themeConfig.layout as Record<string, unknown> | undefined;
    if (!layout) return defaults;

    const pageMargins = layout.pageMargins as Record<string, string> | undefined;
    if (!pageMargins) {
      const preset = layout.margins as string;
      if (preset === 'narrow') return { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' };
      if (preset === 'wide') return { top: '25mm', bottom: '25mm', left: '25mm', right: '25mm' };
      return defaults;
    }

    return {
      top: pageMargins.top || defaults.top,
      bottom: pageMargins.bottom || defaults.bottom,
      left: pageMargins.left || defaults.left,
      right: pageMargins.right || defaults.right,
    };
  }

  private getPageSize(themeConfig?: Record<string, unknown>): string {
    if (!themeConfig) return 'A4';
    const layout = themeConfig.layout as Record<string, unknown> | undefined;
    if (!layout) return 'A4';
    const pageSize = layout.pageSize as string | undefined;
    return pageSize || 'A4';
  }

  private buildThemedHtml(
    sections: TemplateSection[],
    context: PdfRenderContext,
    theme: ThemeStyles,
    themeConfig?: Record<string, unknown>,
  ): string {
    const date = new Date(context.createdAt).toLocaleDateString('es-MX');

    // Build sections HTML
    let sectionsHtml = '';
    for (const section of sections) {
      sectionsHtml += this.renderSection(section, context, theme, themeConfig);
    }

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <style>
    :root {
      --primary: ${theme.primaryColor};
      --primary-light: ${theme.primaryLight};
      --primary-dark: ${theme.primaryDark};
      --text: ${theme.textColor};
      --neutral: ${theme.neutralColor};
      --bg: ${theme.backgroundColor};
    }
    * { box-sizing: border-box; }
    body {
      font-family: ${theme.fontFamily};
      font-size: ${theme.bodySize}px;
      color: var(--text);
      background: var(--bg);
      margin: 0;
      padding: 0;
      line-height: 1.5;
    }
    .report-header {
      border-bottom: 3px solid var(--primary);
      padding-bottom: 12px;
      margin-bottom: 20px;
    }
    .report-header.full {
      background: var(--primary);
      color: white;
      padding: 16px 20px;
      border-radius: 6px;
      margin-bottom: 24px;
      border-bottom: none;
    }
    .report-header h1 {
      margin: 0;
      font-size: 18px;
    }
    .report-header .meta {
      font-size: 11px;
      margin-top: 4px;
      opacity: 0.85;
    }
    .report-section {
      margin: 24px 0;
      padding: 12px 16px;
      border: 1px solid var(--primary-light);
      border-radius: 6px;
      page-break-inside: avoid;
    }
    .report-section h2 {
      font-size: ${theme.titleSize}px;
      color: var(--primary-dark);
      border-bottom: 2px solid var(--primary-light);
      padding-bottom: 6px;
      margin: 0 0 12px 0;
    }
    /* Form content: isolated wrapper only — internal styles untouched */
    .form-content {
      border: none;
      padding: 0;
      margin: 0;
    }
    /* Strip border/padding from the form's root elements when inserted in the report */
    .form-content > *:first-child {
      border: none !important;
      padding-left: 0 !important;
      padding-right: 0 !important;
      margin: 0 !important;
      box-shadow: none !important;
    }
    /* Observations */
    .obs-section .obs-item {
      border-left: 3px solid var(--primary);
      padding-left: 12px;
      margin: 10px 0;
    }
    .obs-section .obs-date {
      font-size: 9px;
      color: var(--neutral);
      font-style: italic;
    }
    .obs-section .obs-content {
      font-size: 11px;
      margin-top: 2px;
    }
    /* State history */
    .history-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
    }
    .history-table th {
      background: var(--primary-light);
      color: var(--primary-dark);
      padding: 6px 10px;
      text-align: left;
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .history-table td {
      padding: 6px 10px;
      border-bottom: 1px solid #f1f5f9;
    }
    .history-table tr:nth-child(even) td {
      background: #f8fafc;
    }
    /* Signatures */
    .signatures-section .sig-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 40px;
      margin-top: 30px;
    }
    .signatures-section .sig-block {
      text-align: center;
      padding-top: 50px;
    }
    .signatures-section .sig-line {
      border-top: 1px solid var(--text);
      margin: 0 20px;
      padding-top: 6px;
      font-size: 10px;
      color: var(--neutral);
    }
    /* Footer */
    .report-footer {
      margin-top: 30px;
      padding-top: 10px;
      border-top: 1px solid #e2e8f0;
      font-size: 9px;
      color: var(--neutral);
      text-align: center;
    }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  ${context.rejectionReason ? `
  <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:10px;margin-bottom:16px;">
    <strong style="color:#dc2626;">Motivo de rechazo:</strong> ${escapeHtml(context.rejectionReason)}
  </div>` : ''}

  <!-- Sections -->
  ${sectionsHtml}

  <!-- Footer -->
  <div class="report-footer">
    Generado el ${new Date().toLocaleDateString('es-MX')} &bull; SGR - Sistema de Gestión de Ensayos
  </div>
</body>
</html>`;
  }

  private renderSection(
    section: TemplateSection,
    context: PdfRenderContext,
    theme: ThemeStyles,
    themeConfig?: Record<string, unknown>,
  ): string {
    // For cover_page type, render inline without report-section wrapper
    if (section.type === 'cover_page') {
      return this.renderCoverPage(section, context, theme, themeConfig);
    }

    switch (section.type) {
      case 'cover_page':
        return this.renderCoverPage(section, context, theme, themeConfig);
      case 'form_content':
        return this.renderFormContent(section, context);
      case 'static':
        return this.renderStatic(section);
      case 'observations':
        return this.renderObservations(section, context);
      case 'state_history':
        return this.renderStateHistory(section, context);
      case 'signatures':
        return this.renderSignatures(section);
      case 'custom_html':
        return this.renderCustomHtml(section);
      default:
        return '';
    }
  }

  private renderCoverPage(section: TemplateSection, context: PdfRenderContext, theme: ThemeStyles, themeConfig?: Record<string, unknown>): string {
    const config = section.config as { content?: string; showDate?: boolean; showTecnico?: boolean };
    const date = new Date(context.createdAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
    const hasTecnico = config.showTecnico !== false;
    const hasDate = config.showDate !== false;

    let lines = '';
    lines += `<h1 style="font-size:22px;font-weight:700;color:var(--primary-dark);margin:0 0 8px;">${escapeHtml(context.formName)}</h1>`;
    if (config.content) lines += `<p style="font-size:14px;color:var(--neutral);margin:0 0 12px;">${escapeHtml(config.content)}</p>`;
    lines += `<div style="width:50px;height:2px;background:var(--primary);margin:14px auto;"></div>`;
    if (hasTecnico) lines += `<p style="font-size:12px;color:var(--text);margin:4px 0;">Técnico: ${escapeHtml(context.tecnicoName)}</p>`;
    if (hasDate) lines += `<p style="font-size:12px;color:var(--text);margin:4px 0;">Fecha: ${date}</p>`;

    return `<div style="text-align:center;padding-top:30%;">${lines}</div><div style="page-break-after:always;"></div>`;
  }

  private renderFormContent(section: TemplateSection, context: PdfRenderContext): string {
    const responses = context.responses || {};

    // If we have the pre-rendered HTML (captured at submit time), use it directly
    const renderedHtml = responses['__rendered_html'] as string;
    if (renderedHtml) {
      // Replace canvas placeholder with captured image
      let html = renderedHtml;
      const canvasImage = responses['__canvas_image'] as string;
      if (canvasImage) {
        html = html.replace(
          /<div id="konva-stage">[\s\S]*?<\/div>/,
          `<img src="${canvasImage}" style="width:100%;max-width:760px;" />`,
        );
      }
      // Remove interactive elements not needed in PDF
      html = html.replace(/<button[^>]*>[\s\S]*?<\/button>/gi, '');
      return `
      <div class="report-section">
        ${(section.config as any).printTitle ? `<h2>${section.title}</h2>` : ''}
        <div class="form-content">${html}</div>
      </div>`;
    }

    // Fallback: use server-side renderer
    const formHtml = context.formHtml || '<p>Sin contenido de formulario</p>';
    const fallbackHtml = renderFormForPdf(formHtml, responses);
    return `
    <div class="report-section">
      ${(section.config as any).printTitle ? `<h2>${section.title}</h2>` : ''}
      <div class="form-content">${fallbackHtml}</div>
    </div>`;
  }

  private renderStatic(section: TemplateSection): string {
    const config = section.config as { content?: string; printTitle?: boolean };
    if (!config.content) return '';
    return `
    <div class="report-section">
      ${config.printTitle ? `<h2>${section.title}</h2>` : ''}
      <p>${config.content}</p>
    </div>`;
  }

  private renderObservations(section: TemplateSection, context: PdfRenderContext): string {
    if (context.observations.length === 0) {
      return `
      <div class="report-section obs-section">
        ${(section.config as any).printTitle ? `<h2>${section.title}</h2>` : ''}
        <p style="color:var(--neutral);font-style:italic;">Sin observaciones registradas.</p>
      </div>`;
    }

    const sorted = [...context.observations].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    const items = sorted.map((obs) => `
      <div class="obs-item">
        <div class="obs-date">${escapeHtml(new Date(obs.date).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }))}</div>
        <div class="obs-content">${escapeHtml(obs.content)}</div>
      </div>
    `).join('');

    return `
    <div class="report-section obs-section">
      ${(section.config as any).printTitle ? `<h2>${section.title}</h2>` : ''}
      ${items}
    </div>`;
  }

  private renderStateHistory(section: TemplateSection, context: PdfRenderContext): string {
    if (context.transitions.length === 0) {
      return `
      <div class="report-section">
        ${(section.config as any).printTitle ? `<h2>${section.title}</h2>` : ''}
        <p style="color:var(--neutral);font-style:italic;">Sin historial de transiciones.</p>
      </div>`;
    }

    const rows = context.transitions.map((t) => `
      <tr>
        <td>${escapeHtml(new Date(t.date).toLocaleDateString('es-MX'))}</td>
        <td>${escapeHtml(t.from)} → ${escapeHtml(t.to)}</td>
        <td>${escapeHtml(t.reason || '—')}</td>
      </tr>
    `).join('');

    return `
    <div class="report-section">
      ${(section.config as any).printTitle ? `<h2>${section.title}</h2>` : ''}
      <table class="history-table">
        <thead><tr><th>Fecha</th><th>Transición</th><th>Motivo</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  private renderSignatures(section: TemplateSection): string {
    const config = section.config as { roles?: string[] };
    const roles = config.roles || ['Responsable'];

    const blocks = roles.map((role) => `
      <div class="sig-block">
        <div class="sig-line">${role}</div>
      </div>
    `).join('');

    return `
    <div class="report-section signatures-section">
      ${(section.config as any).printTitle ? `<h2>${section.title}</h2>` : ''}
      <div class="sig-grid">${blocks}</div>
    </div>`;
  }

  private renderCustomHtml(section: TemplateSection): string {
    const config = section.config as { htmlContent?: string };
    return `
    <div class="report-section">
      ${(section.config as any).printTitle ? `<h2>${section.title}</h2>` : ''}
      ${config.htmlContent || ''}
    </div>`;
  }

  /**
   * Inject response values into the form HTML (same logic as legacy service).
   */
  private injectResponses(html: string, responses: Record<string, unknown>): string {
    let result = html;

    for (const [name, value] of Object.entries(responses)) {
      // Set input values
      const inputRegex = new RegExp(`(<input[^>]*name=["']${name}["'][^>]*?)(/?>)`, 'gi');
      result = result.replace(inputRegex, (match, before, close) => {
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
          '$1 selected$2',
        );
        return `${open}${updatedOptions}${close}`;
      });
    }

    return result;
  }
}
