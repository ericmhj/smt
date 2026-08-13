/**
 * Server-side form HTML renderer for PDF generation.
 * Builds complete static HTML from form responses without relying on client-side JavaScript.
 */

interface AreaData {
  nombre: string;
  largo: string;
  ancho: string;
  alto: string;
  id: string;
  x: number;
  y: number;
  pixelW: number;
  pixelH: number;
}

export function renderFormForPdf(
  originalHtml: string,
  responses: Record<string, unknown>,
): string {
  // 1. Inject static field values into the original HTML
  let html = injectStaticValues(originalHtml, responses);

  // 2. Replace canvas with static image if available
  const canvasImage = responses['__canvas_image'] as string;
  if (canvasImage) {
    html = html.replace(
      /<div id="konva-stage"><\/div>/,
      `<img src="${canvasImage}" style="width:100%;max-width:760px;" />`,
    );
  }

  // 3. Parse plano_areas_json and generate dynamic sections
  const areasJson = (responses['plano_areas_json'] || responses['plano-data'] || '') as string;
  let areas: AreaData[] = [];
  try {
    if (areasJson) areas = JSON.parse(areasJson);
  } catch { /* ignore */ }

  if (areas.length > 0) {
    // Generate the dynamic area sections HTML
    const dynamicSectionsHtml = renderAreaSections(areas, responses);
    // Insert before the canvas section or at the end of .page
    const insertPoint = html.indexOf('<!-- CONTENEDOR DE BLOQUES ITERATIVOS POR ÁREA -->');
    if (insertPoint > -1) {
      const endTag = '</div><!-- end areas-iterativas -->';
      const containerEnd = html.indexOf('</div>', html.indexOf('id="areas-iterativas-container"'));
      // Replace the empty container with rendered content
      html = html.replace(
        /(<div id="areas-iterativas-container">)[\s\S]*?(<\/div>\s*<\/div><!-- \.page -->)/,
        `$1${dynamicSectionsHtml}$2`,
      );
    }

    // Hide the banner
    html = html.replace(
      /(<div class="areas-banner"[^>]*id="areas-banner"[^>]*>)[\s\S]*?(<\/div>)/,
      '$1<div style="display:none"></div>$2',
    );
  }

  // 4. Remove all <script> tags (not needed for PDF)
  html = html.replace(/<script[\s\S]*?<\/script>/gi, '');

  // 5. Remove interactive-only elements (buttons, progress fab)
  html = html.replace(/<button[^>]*>[\s\S]*?<\/button>/gi, '');
  html = html.replace(/<div class="progress-fab"[\s\S]*?<\/div>/gi, '');

  return html;
}

function renderAreaSections(areas: AreaData[], responses: Record<string, unknown>): string {
  return areas.map((area, idx) => {
    const areaId = area.id || `area-${idx}`;
    const areaName = area.nombre || `Área ${idx + 1}`;

    // Calculate NOM-025 values
    const largo = parseFloat(area.largo) || 0;
    const ancho = parseFloat(area.ancho) || 0;
    const alto = parseFloat(area.alto) || 0;
    const hTrabajo = 0.75;
    const hUtil = alto - hTrabajo;
    const ic = hUtil > 0 && (largo + ancho) > 0 ? (largo * ancho) / (hUtil * (largo + ancho)) : 0;

    let nMinimo = 0, matriz = '';
    if (ic < 1) { nMinimo = 4; matriz = '2x2'; }
    else if (ic < 2) { nMinimo = 9; matriz = '3x3'; }
    else if (ic < 3) { nMinimo = 16; matriz = '4x4'; }
    else if (ic < 4) { nMinimo = 25; matriz = '5x5'; }
    else { nMinimo = 36; matriz = '6x6'; }

    const puntos = parseInt(String(responses[`area_${idx}_puntos_evaluados`] || nMinimo)) || nMinimo;

    // Build points table
    let puntosHtml = '';
    for (let i = 1; i <= puntos; i++) {
      const ptArea = responses[`${areaId}_pt${i}_area`] || '';
      const ptZona = responses[`${areaId}_pt${i}_zona`] || '';
      const ptId = responses[`${areaId}_pt${i}_id`] || '';
      const bg = i % 2 === 0 ? 'background:#f9fafb;' : '';
      puntosHtml += `<tr style="${bg}"><td style="border:1px solid #d1d5db;padding:4px 6px;text-align:center;font-weight:600;color:#1a6b3a;width:30px;">${i}</td><td style="border:1px solid #d1d5db;padding:4px 6px;">${ptArea}</td><td style="border:1px solid #d1d5db;padding:4px 6px;">${ptZona}</td><td style="border:1px solid #d1d5db;padding:4px 6px;">${ptId}</td></tr>`;
    }

    // Build results table
    let resultadosHtml = '';
    for (let p = 1; p <= puntos; p++) {
      const rArea = responses[`${areaId}_r${p}_area`] || '';
      const horaLx = responses[`${areaId}_r${p}_m1_hora_lx`] || '';
      const lx = responses[`${areaId}_r${p}_m1_lx`] || '';
      const uLx = responses[`${areaId}_r${p}_u_lx`] || '';
      const nmi = responses[`${areaId}_r${p}_nmi`] || '';
      const horaKf = responses[`${areaId}_r${p}_m1_hora_kf`] || '';
      const e1 = responses[`${areaId}_r${p}_m1_e1`] || '';
      const e2 = responses[`${areaId}_r${p}_m1_e2`] || '';
      const uPct = responses[`${areaId}_r${p}_u_pct`] || '';
      const nmp = responses[`${areaId}_r${p}_nmp`] || '';
      const kf = e1 && e2 && Number(e2) !== 0 ? ((Number(e1) / Number(e2)) * 100).toFixed(1) + '%' : '-';
      const bg = p % 2 === 0 ? 'background:#f9fafb;' : '';

      resultadosHtml += `<tr style="${bg}">
        <td style="border:1px solid #d1d5db;padding:3px 5px;">${rArea}</td>
        <td style="border:1px solid #d1d5db;padding:3px 5px;text-align:center;font-weight:600;color:#1a6b3a;">${p}</td>
        <td style="border:1px solid #d1d5db;padding:3px 5px;text-align:center;">${horaLx}</td>
        <td style="border:1px solid #d1d5db;padding:3px 5px;text-align:center;font-weight:500;">${lx}</td>
        <td style="border:1px solid #d1d5db;padding:3px 5px;text-align:center;">${uLx}</td>
        <td style="border:1px solid #d1d5db;padding:3px 5px;text-align:center;">${nmi}</td>
        <td style="border:1px solid #d1d5db;padding:3px 5px;text-align:center;">${horaKf}</td>
        <td style="border:1px solid #d1d5db;padding:3px 5px;text-align:center;font-weight:600;color:#1a6b3a;">${e1 || e2 ? e1 + '/' + e2 + ' = ' + kf : '-'}</td>
        <td style="border:1px solid #d1d5db;padding:3px 5px;text-align:center;">${uPct}</td>
        <td style="border:1px solid #d1d5db;padding:3px 5px;text-align:center;">${nmp}</td>
      </tr>`;
    }

    const condiciones = responses[`area_${idx}_condiciones`] || '';
    const conclusionArea = responses[`area_${idx}_conclusion_area`] || areaName;
    const conclusionTexto = responses[`area_${idx}_conclusion_texto`] || '';
    const conclusionFecha = responses[`area_${idx}_conclusion_fecha`] || '';

    return `
    <div style="border:1.5px solid #1a6b3a;border-radius:6px;padding:20px;margin:24px 0;page-break-inside:avoid;background:#fff;">
      <div style="background:#1a6b3a;color:white;padding:10px 14px;margin:-20px -20px 16px;border-radius:4px 4px 0 0;">
        <h3 style="font-size:13px;margin:0;font-weight:700;">4. Desarrollo y contenido del Informe / "${areaName}"</h3>
      </div>

      <p style="font-size:11px;color:#374151;margin-bottom:10px;padding:6px 8px;background:#f4fbf7;border-left:3px solid #2e8b57;border-radius:0 4px 4px 0;"><strong>Condiciones de operación:</strong> ${condiciones || 'No especificadas'}</p>

      <div style="font-size:11px;font-weight:600;color:#374151;margin:12px 0 6px;padding-left:8px;border-left:2px solid #2e8b57;">Datos del Muestreo NOM-025</div>
      <table style="width:100%;font-size:11px;margin-bottom:14px;border-collapse:collapse;border:1px solid #d1d5db;">
        <tr><td style="border:1px solid #d1d5db;padding:5px 10px;background:#e8f5ee;font-weight:500;color:#374151;width:25%;">Largo (x)</td><td style="border:1px solid #d1d5db;padding:5px 10px;width:25%;">${area.largo} m</td>
            <td style="border:1px solid #d1d5db;padding:5px 10px;background:#e8f5ee;font-weight:500;color:#374151;width:25%;">Ancho (y)</td><td style="border:1px solid #d1d5db;padding:5px 10px;width:25%;">${area.ancho} m</td></tr>
        <tr><td style="border:1px solid #d1d5db;padding:5px 10px;background:#e8f5ee;font-weight:500;color:#374151;">Altura Luminaria (H)</td><td style="border:1px solid #d1d5db;padding:5px 10px;">${area.alto} m</td>
            <td style="border:1px solid #d1d5db;padding:5px 10px;background:#e8f5ee;font-weight:500;color:#374151;">Altura Útil (h)</td><td style="border:1px solid #d1d5db;padding:5px 10px;font-weight:700;color:#1a6b3a;">${hUtil.toFixed(2)} m</td></tr>
        <tr><td style="border:1px solid #d1d5db;padding:5px 10px;background:#e8f5ee;font-weight:500;color:#374151;">Índice de Área (IC)</td><td style="border:1px solid #d1d5db;padding:5px 10px;font-weight:700;color:#1a6b3a;">${ic.toFixed(2)}</td>
            <td style="border:1px solid #d1d5db;padding:5px 10px;background:#e8f5ee;font-weight:500;color:#374151;">Puntos mínimos</td><td style="border:1px solid #d1d5db;padding:5px 10px;font-weight:700;color:#1a6b3a;">${nMinimo} (${matriz})</td></tr>
      </table>

      <div style="font-size:11px;font-weight:600;color:#374151;margin:14px 0 6px;padding-left:8px;border-left:2px solid #2e8b57;">Puntos Evaluados (${puntos})</div>
      <table style="width:100%;font-size:10px;border-collapse:collapse;margin-bottom:14px;border:1px solid #d1d5db;">
        <thead><tr style="background:#1a6b3a;color:white;">
          <th style="padding:6px 8px;border:1px solid rgba(255,255,255,0.2);font-size:10px;">No.</th>
          <th style="padding:6px 8px;border:1px solid rgba(255,255,255,0.2);font-size:10px;">Área(s)</th>
          <th style="padding:6px 8px;border:1px solid rgba(255,255,255,0.2);font-size:10px;">Zona(s)</th>
          <th style="padding:6px 8px;border:1px solid rgba(255,255,255,0.2);font-size:10px;">Identificación del Punto</th>
        </tr></thead>
        <tbody>${puntosHtml || '<tr><td colspan="4" style="text-align:center;padding:12px;color:#6b7280;border:1px solid #d1d5db;">Sin datos de puntos evaluados</td></tr>'}</tbody>
      </table>

      <div style="font-size:11px;font-weight:600;color:#374151;margin:14px 0 6px;padding-left:8px;border-left:2px solid #2e8b57;">5. Resultados de la Evaluación</div>
      <table style="width:100%;font-size:9px;border-collapse:collapse;margin-bottom:14px;border:1px solid #d1d5db;">
        <thead><tr style="background:#1a6b3a;color:white;">
          <th style="padding:5px;border:1px solid rgba(255,255,255,0.2);min-width:70px;">ÁREA/ZONA</th>
          <th style="padding:5px;border:1px solid rgba(255,255,255,0.2);">PTO</th>
          <th style="padding:5px;border:1px solid rgba(255,255,255,0.2);">Hora</th>
          <th style="padding:5px;border:1px solid rgba(255,255,255,0.2);">Iluminancia (lx)</th>
          <th style="padding:5px;border:1px solid rgba(255,255,255,0.2);">U (lx)</th>
          <th style="padding:5px;border:1px solid rgba(255,255,255,0.2);">N.M.I (lx)</th>
          <th style="padding:5px;border:1px solid rgba(255,255,255,0.2);">Hora</th>
          <th style="padding:5px;border:1px solid rgba(255,255,255,0.2);">Kf (%) E1/E2×100</th>
          <th style="padding:5px;border:1px solid rgba(255,255,255,0.2);">U (%)</th>
          <th style="padding:5px;border:1px solid rgba(255,255,255,0.2);">N.M.P (%)</th>
        </tr></thead>
        <tbody>${resultadosHtml || '<tr><td colspan="10" style="text-align:center;padding:12px;color:#6b7280;border:1px solid #d1d5db;">Sin datos de resultados</td></tr>'}</tbody>
      </table>

      <div style="background:#1a6b3a;color:white;padding:8px 12px;font-size:12px;font-weight:600;border-radius:4px 4px 0 0;">6. Conclusión Técnica — ${conclusionArea}</div>
      <div style="border:1px solid #d1d5db;border-top:none;padding:12px;font-size:11px;margin-bottom:12px;border-radius:0 0 4px 4px;">
        ${conclusionFecha ? `<p style="margin:0 0 6px;color:#6b7280;"><strong>Fecha del ensayo:</strong> ${conclusionFecha}</p>` : ''}
        <p style="margin:0;line-height:1.5;">${conclusionTexto || '<span style="color:#9ca3af;">Sin conclusión técnica</span>'}</p>
      </div>
    </div>`;
  }).join('\n');
}

function injectStaticValues(html: string, responses: Record<string, unknown>): string {
  let result = html;
  for (const [name, value] of Object.entries(responses)) {
    if (name.startsWith('__')) continue; // skip internal fields
    // Input values
    const inputRegex = new RegExp(`(<input[^>]*name=["']${escapeRegex(name)}["'][^>]*?)(/?>)`, 'gi');
    result = result.replace(inputRegex, (match, before, close) => {
      const cleaned = before.replace(/\s+value=["'][^"']*["']/gi, '');
      return `${cleaned} value="${escapeHtml(String(value || ''))}"${close}`;
    });
    // Textarea
    const textareaRegex = new RegExp(`(<textarea[^>]*name=["']${escapeRegex(name)}["'][^>]*>)(.*?)(<\/textarea>)`, 'gis');
    result = result.replace(textareaRegex, `$1${escapeHtml(String(value || ''))}$3`);
    // Select
    const selectRegex = new RegExp(`(<select[^>]*name=["']${escapeRegex(name)}["'][^>]*>)(.*?)(<\/select>)`, 'gis');
    result = result.replace(selectRegex, (match, open, options, close) => {
      const updated = options.replace(
        new RegExp(`(<option[^>]*value=["']${escapeRegex(String(value))}["'][^>]*?)(/?>)`, 'gi'),
        '$1 selected$2',
      );
      return `${open}${updated}${close}`;
    });
  }
  return result;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
