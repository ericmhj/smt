import { JSDOM } from 'jsdom';

/**
 * Resultado del conteo de puntos de muestreo de un reporte finalizado.
 */
export interface PointsCountResult {
  /** Total de puntos sumados sobre todas las áreas. */
  numeroPuntos: number;
  /** Detalle por área (para diagnóstico/auditoría). */
  areas: Array<{ areaId: string; puntos: number }>;
  /** true si todas las áreas tienen consistencia entre sus dos matrices. */
  consistent: boolean;
  /** Descripción de la inconsistencia detectada (si aplica). */
  inconsistency?: string;
  /** Fuente del conteo: 'html' (reporte real) o 'fallback' (responses). */
  source: 'html' | 'fallback';
}

/**
 * Cuenta el número de puntos de muestreo de un reporte NOM-025 finalizado,
 * leyéndolo directamente del HTML renderizado (valor real que vio y firmó el
 * usuario), y validando la consistencia entre las dos matrices por área:
 *   - Matriz de "Puntos Evaluados"  (tabla.puntos-tbody / filas pt)
 *   - Matriz de "Resultados"        (tabla.resultados-tbody / filas r)
 *
 * Ambas deben tener el mismo número de filas por área. Si difieren, se marca
 * la inconsistencia (el cobro no debe proceder con datos ambiguos).
 *
 * El valor a cobrar es la suma de puntos de UNA matriz por área (no se duplica),
 * sumada sobre todas las áreas.
 *
 * Si el HTML no está disponible o no contiene bloques de área, se hace fallback
 * al conteo derivado de `responses` (mismo algoritmo que el renderer del PDF).
 */
export function countReportPoints(responses: Record<string, unknown>): PointsCountResult {
  const renderedHtml = responses['__rendered_html'] as string | undefined;

  if (renderedHtml && typeof renderedHtml === 'string' && renderedHtml.trim() !== '') {
    const fromHtml = countFromHtml(renderedHtml);
    if (fromHtml) return fromHtml;
  }

  // Fallback: derivar del contenido de responses (reportes antiguos o sin HTML).
  return countFromResponses(responses);
}

/**
 * Cuenta puntos por área desde el HTML renderizado, validando consistencia
 * entre las dos matrices. Devuelve null si el HTML no contiene bloques de área
 * reconocibles (para permitir el fallback).
 */
function countFromHtml(renderedHtml: string): PointsCountResult | null {
  let document: Document;
  try {
    document = new JSDOM(renderedHtml).window.document;
  } catch {
    return null;
  }

  const areaBlocks = Array.from(document.querySelectorAll('.area-block'));
  if (areaBlocks.length === 0) {
    return null;
  }

  const areas: Array<{ areaId: string; puntos: number }> = [];
  let consistent = true;
  let inconsistency: string | undefined;

  areaBlocks.forEach((block, idx) => {
    const areaId = block.getAttribute('data-area-id') || `area-${idx}`;

    // Matriz "Puntos Evaluados": una fila (con inputs) por punto.
    const puntosMatriz = countPuntosMatrix(block);
    // Matriz "Resultados": N filas por punto (1 nocturno / 3 natural) + filas
    // separadoras; el número real de puntos = cantidad de valores distintos de
    // data-punto.
    const resultadosMatriz = countResultadosMatrix(block);

    // Consistencia: si ambas matrices existen, deben coincidir en número de puntos.
    if (puntosMatriz !== null && resultadosMatriz !== null) {
      if (puntosMatriz !== resultadosMatriz) {
        consistent = false;
        inconsistency =
          `Área '${areaId}': la matriz de Puntos Evaluados (${puntosMatriz}) no coincide ` +
          `con la matriz de Resultados (${resultadosMatriz}).`;
      }
    }

    // Valor de referencia: la matriz de puntos evaluados (una fila = un punto);
    // si no existe, se usa el conteo de la matriz de resultados.
    const puntos = puntosMatriz ?? resultadosMatriz ?? 0;
    areas.push({ areaId, puntos });
  });

  const numeroPuntos = areas.reduce((sum, a) => sum + a.puntos, 0);

  return { numeroPuntos, areas, consistent, inconsistency, source: 'html' };
}

/**
 * Matriz "Puntos Evaluados" (tbody.puntos-tbody): una fila por punto, cada una
 * con inputs de datos. Se cuentan las filas con inputs, ignorando la fila
 * placeholder ("Ingrese dimensiones...") que usa colspan.
 * Devuelve null si la matriz no está presente.
 */
function countPuntosMatrix(block: Element): number | null {
  const tbody = block.querySelector('tbody.puntos-tbody');
  if (!tbody) return null;

  const rows = Array.from(tbody.querySelectorAll('tr')).filter((tr) => {
    const cells = tr.querySelectorAll('td');
    if (cells.length === 0) return false;
    const placeholder = Array.from(cells).some((td) => td.hasAttribute('colspan'));
    return !placeholder;
  });

  return rows.length;
}

/**
 * Matriz "Resultados" (tbody.resultados-tbody): cada punto ocupa 1 fila
 * (nocturno) o 3 filas (natural), todas marcadas con data-punto="N", más filas
 * separadoras sin data-punto. El número real de puntos es la cantidad de
 * valores distintos de data-punto.
 * Devuelve null si la matriz no está presente.
 */
function countResultadosMatrix(block: Element): number | null {
  const tbody = block.querySelector('tbody.resultados-tbody');
  if (!tbody) return null;

  const puntoIds = new Set<string>();
  tbody.querySelectorAll('tr[data-punto]').forEach((tr) => {
    const p = tr.getAttribute('data-punto');
    if (p) puntoIds.add(p);
  });

  return puntoIds.size;
}

/**
 * Fallback: replica el algoritmo del renderer del PDF (pdf-form-renderer.ts)
 * para derivar el número de puntos desde `responses` cuando no hay HTML.
 */
function countFromResponses(responses: Record<string, unknown>): PointsCountResult {
  const areasJson = (responses['plano_areas_json'] || responses['plano-data'] || '') as string;
  let areas: Array<{ id?: string; largo?: string; ancho?: string; alto?: string }> = [];
  try {
    if (areasJson) areas = JSON.parse(areasJson);
  } catch {
    areas = [];
  }

  const detail: Array<{ areaId: string; puntos: number }> = areas.map((area, idx) => {
    const areaId = area.id || `area-${idx}`;
    const largo = parseFloat(String(area.largo)) || 0;
    const ancho = parseFloat(String(area.ancho)) || 0;
    const alto = parseFloat(String(area.alto)) || 0;
    const hUtil = alto - 0.75;
    const ic = hUtil > 0 && largo + ancho > 0 ? (largo * ancho) / (hUtil * (largo + ancho)) : 0;

    let nMinimo = 0;
    if (ic < 1) nMinimo = 4;
    else if (ic < 2) nMinimo = 9;
    else if (ic < 3) nMinimo = 16;
    else if (ic < 4) nMinimo = 25;
    else nMinimo = 36;

    const puntos = parseInt(String(responses[`area_${idx}_puntos_evaluados`] || nMinimo), 10) || nMinimo;
    return { areaId, puntos };
  });

  const numeroPuntos = detail.reduce((sum, a) => sum + a.puntos, 0);

  // En el fallback no hay dos matrices que comparar: se considera consistente.
  return { numeroPuntos, areas: detail, consistent: true, source: 'fallback' };
}
