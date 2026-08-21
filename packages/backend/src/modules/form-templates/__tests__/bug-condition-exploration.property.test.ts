/**
 * Property-Based Test: Bug Condition Exploration
 *
 * Property 1: Bug Condition - Tipo de muestreo uniforme sin override individual
 *
 * GOAL: Surface counterexamples that demonstrate the bug exists in UNFIXED code.
 * This test encodes the EXPECTED behavior - it will FAIL on unfixed code (confirming the bug)
 * and PASS once the fix is implemented.
 *
 * Bug Condition: isBugCondition(input) returns true when
 *   input.tipoDeseado != tipoAreaDefault AND NOT existeOverrideMechanism(areaBlock, puntoIndex)
 *
 * Validates: Requirements 1.1, 1.2, 1.3
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { JSDOM } from 'jsdom';
import * as fs from 'fs';
import * as path from 'path';

// ─── Setup: Extract generarResultadosBlock from the HTML file ───────────────────

/**
 * Create a minimal DOM block that mimics the area-block structure used by
 * generarResultadosBlock. This simulates the real DOM without needing to
 * load the entire HTML page.
 */
function createAreaBlock(
  document: Document,
  areaId: string,
  tipoTurno: 'nocturno' | 'natural',
): HTMLElement {
  const block = document.createElement('div');
  block.classList.add('area-block');
  block.setAttribute('data-area-id', areaId);
  block.setAttribute('data-area-name', 'Test Area');

  // Create tipo-turno radio buttons (same structure as in the real HTML)
  const radioContainer = document.createElement('div');

  const radioNocturno = document.createElement('input');
  radioNocturno.type = 'radio';
  radioNocturno.classList.add('tipo-turno');
  radioNocturno.name = `tipo_turno_${areaId}`;
  radioNocturno.value = 'nocturno';
  radioNocturno.checked = tipoTurno === 'nocturno';

  const radioNatural = document.createElement('input');
  radioNatural.type = 'radio';
  radioNatural.classList.add('tipo-turno');
  radioNatural.name = `tipo_turno_${areaId}`;
  radioNatural.value = 'natural';
  radioNatural.checked = tipoTurno === 'natural';

  radioContainer.appendChild(radioNocturno);
  radioContainer.appendChild(radioNatural);
  block.appendChild(radioContainer);

  // Create the results table structure
  const table = document.createElement('table');
  table.classList.add('data-table');
  const thead = document.createElement('thead');
  thead.classList.add('resultados-thead');
  const tbody = document.createElement('tbody');
  tbody.classList.add('resultados-tbody');
  table.appendChild(thead);
  table.appendChild(tbody);
  block.appendChild(table);

  return block;
}

/**
 * Extract and evaluate generarResultadosBlock from the HTML file.
 * We parse the function source and create a callable version in our jsdom env.
 */
function loadGenerarResultadosBlock(window: Window & typeof globalThis): (block: HTMLElement, numPuntos: number) => void {
  const htmlPath = path.resolve(__dirname, '../../../../../../docs/nueva-propuesta-formulario.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf-8');

  // Extract the function body of generarResultadosBlock
  const funcStart = htmlContent.indexOf('function generarResultadosBlock(block, numPuntos)');
  if (funcStart === -1) throw new Error('Could not find generarResultadosBlock in HTML file');

  // Find the complete function by counting braces
  let braceCount = 0;
  let funcEnd = -1;
  let started = false;
  for (let i = funcStart; i < htmlContent.length; i++) {
    if (htmlContent[i] === '{') { braceCount++; started = true; }
    if (htmlContent[i] === '}') { braceCount--; }
    if (started && braceCount === 0) { funcEnd = i + 1; break; }
  }

  if (funcEnd === -1) throw new Error('Could not parse generarResultadosBlock function boundaries');

  const funcSource = htmlContent.substring(funcStart, funcEnd);

  // Also extract helper functions that generarResultadosBlock calls
  // bindMeasurementListeners and recalcularEstadisticos - we stub them since
  // we only care about the DOM structure generated
  const setupCode = `
    function bindMeasurementListeners(block) {}
    function recalcularEstadisticos(block) {}
    function calcKfBlock(block, punto, medicion) {}
    function calcPromBlock(block, punto) {}
    ${funcSource}
  `;

  // Create the function in the window context
  const fn = new (window as any).Function('block', 'numPuntos', `
    ${setupCode}
    generarResultadosBlock(block, numPuntos);
  `);

  return fn;
}

// ─── Arbitraries (Generators) ──────────────────────────────────────────────────

/** Generate a valid number of puntos (1-20, realistic range) */
const arbNumPuntos = fc.integer({ min: 1, max: 15 });

/** Generate the area default tipo */
const arbTipoDefault = fc.constantFrom('nocturno' as const, 'natural' as const);

/** Generate a punto index that wants a DIFFERENT tipo than the area default */
const arbBugConditionInput = fc.record({
  numPuntos: arbNumPuntos,
  tipoDefault: arbTipoDefault,
}).chain(({ numPuntos, tipoDefault }) =>
  fc.record({
    numPuntos: fc.constant(numPuntos),
    tipoDefault: fc.constant(tipoDefault),
    // A punto that needs the OPPOSITE tipo
    puntoIndex: fc.integer({ min: 1, max: numPuntos }),
    tipoDeseado: fc.constant(tipoDefault === 'nocturno' ? 'natural' : 'nocturno') as fc.Arbitrary<'nocturno' | 'natural'>,
  }),
);

// ─── Property Tests ────────────────────────────────────────────────────────────

describe('Bug Condition Exploration - Property Tests', () => {
  let dom: JSDOM;
  let document: Document;
  let window: Window & typeof globalThis;
  let generarResultadosBlock: (block: HTMLElement, numPuntos: number) => void;

  beforeEach(() => {
    dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
      url: 'http://localhost',
    });
    document = dom.window.document;
    window = dom.window as unknown as Window & typeof globalThis;
    generarResultadosBlock = loadGenerarResultadosBlock(window);
  });

  /**
   * Property 1: Bug Condition - All points get uniform treatment
   *
   * For any area with N points and a default tipo, when a specific punto
   * needs a DIFFERENT tipo, verify that the current code has NO mechanism
   * to achieve this (proving the bug exists).
   *
   * The test asserts the EXPECTED behavior: that a punto with tipoDeseado
   * different from the area default SHOULD render the correct number of rows
   * for its desired tipo. On unfixed code this will FAIL because all puntos
   * render uniformly.
   *
   * Validates: Requirements 1.1, 1.2, 1.3
   */
  it('should allow individual punto to have different tipo than area default (EXPECTED TO FAIL on unfixed code)', () => {
    fc.assert(
      fc.property(
        arbBugConditionInput,
        ({ numPuntos, tipoDefault, puntoIndex, tipoDeseado }) => {
          // Setup: create block with area default tipo
          const block = createAreaBlock(document, 'test-area-1', tipoDefault);
          document.body.innerHTML = '';
          document.body.appendChild(block);

          // Act: generate the results table
          generarResultadosBlock(block, numPuntos);

          const tbody = block.querySelector('.resultados-tbody')!;

          // Count the rows that belong to the target punto
          // Each punto's rows have lx-input elements with data-point attribute
          const puntoRows = tbody.querySelectorAll(
            `.lx-input[data-point="${puntoIndex}"]`,
          );

          // Expected: if tipoDeseado is 'natural', punto should have 3 rows (mediciones)
          // If tipoDeseado is 'nocturno', punto should have 1 row
          const expectedMediciones = tipoDeseado === 'natural' ? 3 : 1;

          // THIS IS THE BUG CONDITION ASSERTION:
          // On unfixed code, ALL puntos have the same number of mediciones
          // (determined by area default), so this will FAIL when
          // tipoDeseado != tipoDefault
          //
          // When tipoDefault is 'nocturno': all puntos have 1 row,
          //   but puntoIndex needs 3 rows (natural) → FAILS
          // When tipoDefault is 'natural': all puntos have 3 rows,
          //   but puntoIndex needs 1 row (nocturno) → FAILS
          expect(puntoRows.length).toBe(expectedMediciones);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property 1b: No override mechanism exists in the rendered table
   *
   * Verify that the rendered results table does NOT contain per-point
   * type radio buttons (proving there is no UI for individual override).
   * This test should PASS on unfixed code (confirming absence of mechanism).
   *
   * Validates: Requirements 1.3
   */
  it('should NOT contain per-point tipo radio buttons in the rendered table (confirms no override UI)', () => {
    fc.assert(
      fc.property(
        fc.record({
          numPuntos: arbNumPuntos,
          tipoDefault: arbTipoDefault,
        }),
        ({ numPuntos, tipoDefault }) => {
          // Setup
          const block = createAreaBlock(document, 'test-area-2', tipoDefault);
          document.body.innerHTML = '';
          document.body.appendChild(block);

          // Act: generate the results table
          generarResultadosBlock(block, numPuntos);

          const tbody = block.querySelector('.resultados-tbody')!;

          // Assert: no per-point radio buttons exist inside the results table body
          // (The only radio buttons should be at the area level, NOT per punto)
          const radioButtonsInTable = tbody.querySelectorAll('input[type="radio"]');
          expect(radioButtonsInTable.length).toBe(0);
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * Property 1c: Uniform row count for all points
   *
   * Demonstrates that ALL points get the SAME number of mediciones regardless
   * of individual needs. This test should PASS on unfixed code (confirming the bug
   * that uniform treatment is enforced).
   *
   * On the fixed code, this should also pass because uniform treatment still applies
   * when no overrides exist.
   *
   * Validates: Requirements 1.1, 1.2
   */
  it('all points have identical row count (uniform treatment, no individual override possible)', () => {
    fc.assert(
      fc.property(
        fc.record({
          numPuntos: fc.integer({ min: 2, max: 15 }),
          tipoDefault: arbTipoDefault,
        }),
        ({ numPuntos, tipoDefault }) => {
          // Setup
          const block = createAreaBlock(document, 'test-area-3', tipoDefault);
          document.body.innerHTML = '';
          document.body.appendChild(block);

          // Act
          generarResultadosBlock(block, numPuntos);

          const tbody = block.querySelector('.resultados-tbody')!;
          const expectedMediciones = tipoDefault === 'nocturno' ? 1 : 3;

          // Assert: every punto has the same number of mediciones
          for (let p = 1; p <= numPuntos; p++) {
            const puntoInputs = tbody.querySelectorAll(
              `.lx-input[data-point="${p}"]`,
            );
            expect(puntoInputs.length).toBe(expectedMediciones);
          }
        },
      ),
      { numRuns: 50 },
    );
  });
});
