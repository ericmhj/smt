/**
 * Calculation Engine
 *
 * Computes effective calculation rule set and evaluates formulas
 * against form submission data. Similar architecture to ValidationEngine
 * but produces computed values instead of errors.
 */

import { eq, and } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import { safeMathEval } from '../../lib/safe-math-eval.js';
import {
  calculationRuleTemplates,
  calculationRuleOverrides,
} from '../../db/schema/index.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CalculationRule {
  targetField: string;
  formula: string;
  label?: string;
  precision?: number;
  type?: 'arithmetic' | 'conditional' | 'aggregate';
}

export interface CalculationSection {
  sectionName: string;
  scope: 'section' | 'per_row';
  rowPattern?: string;
  rules: CalculationRule[];
}

export interface EffectiveCalculation {
  id: string;
  name: string;
  source: 'global' | 'custom';
  calculations: CalculationSection[];
}

export interface CalculationResult {
  computedValues: Record<string, unknown>;
}

// ─── Effective Rule Set ──────────────────────────────────────────────────────

export async function computeEffectiveCalculations(
  db: Database,
  formType: string,
  formId: string,
): Promise<EffectiveCalculation[]> {
  const globalRules = await db
    .select()
    .from(calculationRuleTemplates)
    .where(
      and(
        eq(calculationRuleTemplates.formType, formType),
        eq(calculationRuleTemplates.isActive, true),
      ),
    );

  const overrides = await db
    .select()
    .from(calculationRuleOverrides)
    .where(eq(calculationRuleOverrides.formId, formId));

  const deactivatedIds = new Set(
    overrides
      .filter((o) => o.overrideType === 'deactivate' && o.ruleTemplateId)
      .map((o) => o.ruleTemplateId!),
  );

  const activeGlobals: EffectiveCalculation[] = globalRules
    .filter((rule) => !deactivatedIds.has(rule.id))
    .map((rule) => ({
      id: rule.id,
      name: rule.name,
      source: 'global' as const,
      calculations: rule.calculations as CalculationSection[],
    }));

  const customRules: EffectiveCalculation[] = overrides
    .filter((o) => o.overrideType === 'custom' && o.customRule)
    .map((o) => ({
      id: `custom-${o.id}`,
      name: 'Regla de cálculo personalizada',
      source: 'custom' as const,
      calculations: o.customRule as CalculationSection[],
    }));

  return [...activeGlobals, ...customRules];
}

// ─── Formula Evaluator ───────────────────────────────────────────────────────

/**
 * Safely evaluates an arithmetic expression by replacing field references
 * with their values from the responses map.
 */
function evaluateFormula(
  formula: string,
  responses: Record<string, unknown>,
  precision?: number,
): unknown {
  // Handle conditional: "condition ? valueA : valueB"
  if (formula.includes('?') && formula.includes(':')) {
    return evaluateConditional(formula, responses);
  }

  // Handle aggregate functions: AVG(...), SUM(...), MIN(...), MAX(...), COUNT(...)
  const aggMatch = formula.match(/^(AVG|SUM|MIN|MAX|COUNT)\((.+)\)$/i);
  if (aggMatch) {
    return evaluateAggregate(aggMatch[1].toUpperCase(), aggMatch[2], responses, precision);
  }

  // Arithmetic: replace field names with values
  let resolved = formula;
  const fieldRefs = formula.match(/[a-zA-Z_][a-zA-Z0-9_]*/g);

  if (fieldRefs) {
    const uniqueFields = [...new Set(fieldRefs)];
    for (const fieldRef of uniqueFields) {
      // Skip known function names
      if (['AVG', 'SUM', 'MIN', 'MAX', 'COUNT'].includes(fieldRef.toUpperCase())) continue;

      const value = responses[fieldRef];
      const numValue = Number(value);
      if (isNaN(numValue)) return null; // Can't compute
      resolved = resolved.replaceAll(fieldRef, String(numValue));
    }
  }

  // Validate safe expression
  if (!/^[\d\s+\-*/().]+$/.test(resolved)) return null;

  const result = safeMathEval(resolved);
  if (isNaN(result) || !isFinite(result)) return null;
  return precision !== undefined ? Number(result.toFixed(precision)) : result;
}

function evaluateConditional(
  formula: string,
  responses: Record<string, unknown>,
): unknown {
  // Simple: "expression >= value ? 'A' : 'B'"
  const match = formula.match(/^(.+?)\s*\?\s*'([^']*)'\s*:\s*'([^']*)'$/);
  if (!match) return null;

  const condition = match[1];
  const valueTrue = match[2];
  const valueFalse = match[3];

  // Evaluate condition (supports >=, <=, >, <, ==, !=)
  const condMatch = condition.match(/^(.+?)\s*(>=|<=|>|<|==|!=)\s*(.+)$/);
  if (!condMatch) return null;

  const left = evaluateFormula(condMatch[1].trim(), responses) as number;
  const right = Number(condMatch[3].trim());

  if (left === null || isNaN(right)) return null;

  let result = false;
  switch (condMatch[2]) {
    case '>=': result = left >= right; break;
    case '<=': result = left <= right; break;
    case '>': result = left > right; break;
    case '<': result = left < right; break;
    case '==': result = left === right; break;
    case '!=': result = left !== right; break;
  }

  return result ? valueTrue : valueFalse;
}

function evaluateAggregate(
  fn: string,
  fieldsStr: string,
  responses: Record<string, unknown>,
  precision?: number,
): unknown {
  const fieldNames = fieldsStr.split(',').map((f) => f.trim());
  const values: number[] = [];

  for (const fieldName of fieldNames) {
    const val = Number(responses[fieldName]);
    if (!isNaN(val)) values.push(val);
  }

  if (values.length === 0) return null;

  let result: number;
  switch (fn) {
    case 'AVG': result = values.reduce((a, b) => a + b, 0) / values.length; break;
    case 'SUM': result = values.reduce((a, b) => a + b, 0); break;
    case 'MIN': result = Math.min(...values); break;
    case 'MAX': result = Math.max(...values); break;
    case 'COUNT': result = values.length; break;
    default: return null;
  }

  return precision !== undefined ? Number(result.toFixed(precision)) : result;
}

// ─── Main Compute Function ───────────────────────────────────────────────────

/**
 * Computes all calculation rules and returns the computed values.
 * These values should be merged into the responses before persisting.
 */
export async function compute(
  db: Database,
  formId: string,
  formType: string,
  responses: Record<string, unknown>,
): Promise<CalculationResult> {
  try {
    const effectiveRules = await computeEffectiveCalculations(db, formType, formId);

    if (effectiveRules.length === 0) {
      return { computedValues: {} };
    }

    const computedValues: Record<string, unknown> = {};

    for (const rule of effectiveRules) {
      for (const section of rule.calculations) {
        if (section.scope === 'per_row' && section.rowPattern) {
          // Expand per-row formulas
          computePerRow(section, responses, computedValues);
        } else {
          // Section-level formulas
          for (const calc of section.rules) {
            const mergedResponses = { ...responses, ...computedValues };
            const value = evaluateFormula(calc.formula, mergedResponses, calc.precision);
            if (value !== null) {
              computedValues[calc.targetField] = value;
            }
          }
        }
      }
    }

    return { computedValues };
  } catch (err) {
    console.error('[CalculationEngine] Error computing calculations:', err);
    return { computedValues: {} };
  }
}

function computePerRow(
  section: CalculationSection,
  responses: Record<string, unknown>,
  computedValues: Record<string, unknown>,
): void {
  if (!section.rowPattern) return;

  // Detect how many rows exist by scanning response keys
  const pattern = section.rowPattern.replace('{N}', '(\\d+)');
  const regex = new RegExp(pattern);
  const rowNumbers = new Set<number>();

  for (const key of Object.keys(responses)) {
    const match = key.match(regex);
    if (match && match[1]) {
      rowNumbers.add(parseInt(match[1], 10));
    }
  }

  // For each row, evaluate all rules
  for (const n of rowNumbers) {
    for (const calc of section.rules) {
      const targetField = calc.targetField.replace('{N}', String(n));
      const formula = calc.formula.replace(/\{N\}/g, String(n));
      const mergedResponses = { ...responses, ...computedValues };
      const value = evaluateFormula(formula, mergedResponses, calc.precision);
      if (value !== null) {
        computedValues[targetField] = value;
      }
    }
  }
}
