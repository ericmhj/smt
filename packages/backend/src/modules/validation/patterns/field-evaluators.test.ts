/**
 * Unit tests for field evaluators.
 *
 * Tests cover all 7 field-level evaluators:
 * identity, required, range, pattern, transform, lookup, computed.
 */

import { describe, it, expect } from 'vitest';
import { fieldIdentityEvaluator } from './field-identity.js';
import { fieldRequiredEvaluator } from './field-required.js';
import { fieldRangeEvaluator } from './field-range.js';
import { fieldPatternEvaluator } from './field-pattern.js';
import { fieldTransformEvaluator } from './field-transform.js';
import { fieldLookupEvaluator } from './field-lookup.js';
import { fieldComputedEvaluator } from './field-computed.js';

const baseConfig = {
  sectionName: 'test_section',
  ruleName: 'test_rule',
  ruleType: 'global' as const,
};

describe('fieldIdentityEvaluator', () => {
  it('always returns null regardless of value', () => {
    expect(fieldIdentityEvaluator('f', null, baseConfig, {})).toBeNull();
    expect(fieldIdentityEvaluator('f', '', baseConfig, {})).toBeNull();
    expect(fieldIdentityEvaluator('f', 'hello', baseConfig, {})).toBeNull();
    expect(fieldIdentityEvaluator('f', 42, baseConfig, {})).toBeNull();
  });
});

describe('fieldRequiredEvaluator', () => {
  it('returns error for null value', () => {
    const result = fieldRequiredEvaluator('name', null, baseConfig, {});
    expect(result).not.toBeNull();
    expect(result!.message).toBe('El campo es obligatorio');
    expect(result!.fieldName).toBe('name');
  });

  it('returns error for undefined value', () => {
    const result = fieldRequiredEvaluator('name', undefined, baseConfig, {});
    expect(result).not.toBeNull();
  });

  it('returns error for empty string', () => {
    const result = fieldRequiredEvaluator('name', '', baseConfig, {});
    expect(result).not.toBeNull();
  });

  it('returns null for non-empty value', () => {
    expect(fieldRequiredEvaluator('name', 'John', baseConfig, {})).toBeNull();
    expect(fieldRequiredEvaluator('name', 0, baseConfig, {})).toBeNull();
    expect(fieldRequiredEvaluator('name', false, baseConfig, {})).toBeNull();
  });
});

describe('fieldRangeEvaluator', () => {
  const config = { ...baseConfig, min: 0, max: 100 };

  it('returns null for empty/null values (skips)', () => {
    expect(fieldRangeEvaluator('f', null, config, {})).toBeNull();
    expect(fieldRangeEvaluator('f', undefined, config, {})).toBeNull();
    expect(fieldRangeEvaluator('f', '', config, {})).toBeNull();
  });

  it('returns null for NaN values (skips)', () => {
    expect(fieldRangeEvaluator('f', 'abc', config, {})).toBeNull();
  });

  it('returns null for value within range', () => {
    expect(fieldRangeEvaluator('f', 50, config, {})).toBeNull();
    expect(fieldRangeEvaluator('f', 0, config, {})).toBeNull();
    expect(fieldRangeEvaluator('f', 100, config, {})).toBeNull();
    expect(fieldRangeEvaluator('f', '42', config, {})).toBeNull();
  });

  it('returns error for value below min', () => {
    const result = fieldRangeEvaluator('f', -1, config, {});
    expect(result).not.toBeNull();
    expect(result!.message).toBe('El valor debe estar entre 0 y 100');
  });

  it('returns error for value above max', () => {
    const result = fieldRangeEvaluator('f', 101, config, {});
    expect(result).not.toBeNull();
    expect(result!.message).toBe('El valor debe estar entre 0 y 100');
  });
});

describe('fieldPatternEvaluator', () => {
  const config = { ...baseConfig, regex: '^[A-Z]{3}\\d{3}$' };

  it('returns null for empty/null values (skips)', () => {
    expect(fieldPatternEvaluator('f', null, config, {})).toBeNull();
    expect(fieldPatternEvaluator('f', undefined, config, {})).toBeNull();
    expect(fieldPatternEvaluator('f', '', config, {})).toBeNull();
  });

  it('returns null for matching value', () => {
    expect(fieldPatternEvaluator('f', 'ABC123', config, {})).toBeNull();
  });

  it('returns error for non-matching value', () => {
    const result = fieldPatternEvaluator('f', 'abc', config, {});
    expect(result).not.toBeNull();
    expect(result!.message).toBe('El valor no cumple con el formato requerido');
  });

  it('uses custom message from config', () => {
    const customConfig = { ...config, message: 'Formato inválido' };
    const result = fieldPatternEvaluator('f', 'abc', customConfig, {});
    expect(result).not.toBeNull();
    expect(result!.message).toBe('Formato inválido');
  });

  it('gracefully handles invalid regex', () => {
    const badConfig = { ...baseConfig, regex: '[invalid(' };
    expect(fieldPatternEvaluator('f', 'test', badConfig, {})).toBeNull();
  });
});

describe('fieldTransformEvaluator', () => {
  const config = { ...baseConfig, expectedValue: 42, tolerance: 0.5 };

  it('returns null for empty/null values', () => {
    expect(fieldTransformEvaluator('f', null, config, {})).toBeNull();
    expect(fieldTransformEvaluator('f', '', config, {})).toBeNull();
  });

  it('returns null for NaN values', () => {
    expect(fieldTransformEvaluator('f', 'abc', config, {})).toBeNull();
  });

  it('returns null when value is within tolerance', () => {
    expect(fieldTransformEvaluator('f', 42, config, {})).toBeNull();
    expect(fieldTransformEvaluator('f', 42.3, config, {})).toBeNull();
    expect(fieldTransformEvaluator('f', 41.5, config, {})).toBeNull();
  });

  it('returns error when value exceeds tolerance', () => {
    const result = fieldTransformEvaluator('f', 43, config, {});
    expect(result).not.toBeNull();
    expect(result!.message).toBe('El valor no coincide con el resultado esperado');
  });

  it('uses default tolerance of 0.01 when not specified', () => {
    const noTolConfig = { ...baseConfig, expectedValue: 10 };
    expect(fieldTransformEvaluator('f', 10.005, noTolConfig, {})).toBeNull();
    const result = fieldTransformEvaluator('f', 10.02, noTolConfig, {});
    expect(result).not.toBeNull();
  });

  it('returns null when expectedValue is not configured', () => {
    expect(fieldTransformEvaluator('f', 42, baseConfig, {})).toBeNull();
  });
});

describe('fieldLookupEvaluator', () => {
  const config = { ...baseConfig, allowedValues: ['A', 'B', 'C'] };

  it('returns null for empty/null values (skips)', () => {
    expect(fieldLookupEvaluator('f', null, config, {})).toBeNull();
    expect(fieldLookupEvaluator('f', undefined, config, {})).toBeNull();
    expect(fieldLookupEvaluator('f', '', config, {})).toBeNull();
  });

  it('returns null for value in allowed list', () => {
    expect(fieldLookupEvaluator('f', 'A', config, {})).toBeNull();
    expect(fieldLookupEvaluator('f', 'B', config, {})).toBeNull();
    expect(fieldLookupEvaluator('f', 'C', config, {})).toBeNull();
  });

  it('returns error for value not in allowed list', () => {
    const result = fieldLookupEvaluator('f', 'D', config, {});
    expect(result).not.toBeNull();
    expect(result!.message).toBe('El valor no es una opción válida');
  });

  it('compares as strings', () => {
    const numConfig = { ...baseConfig, allowedValues: ['1', '2', '3'] };
    expect(fieldLookupEvaluator('f', 1, numConfig, {})).toBeNull();
  });

  it('returns null when allowedValues is not configured', () => {
    expect(fieldLookupEvaluator('f', 'test', baseConfig, {})).toBeNull();
  });
});

describe('fieldComputedEvaluator', () => {
  const config = { ...baseConfig, expression: 'fieldA + fieldB', tolerance: 0.5 };
  const responses = { fieldA: 10, fieldB: 20 };

  it('returns null for empty/null values', () => {
    expect(fieldComputedEvaluator('f', null, config, responses)).toBeNull();
    expect(fieldComputedEvaluator('f', '', config, responses)).toBeNull();
  });

  it('returns null when value matches computed result within tolerance', () => {
    expect(fieldComputedEvaluator('f', 30, config, responses)).toBeNull();
    expect(fieldComputedEvaluator('f', 30.3, config, responses)).toBeNull();
    expect(fieldComputedEvaluator('f', 29.5, config, responses)).toBeNull();
  });

  it('returns error when value is outside tolerance', () => {
    const result = fieldComputedEvaluator('f', 35, config, responses);
    expect(result).not.toBeNull();
    expect(result!.message).toBe('El valor calculado no coincide con el esperado');
  });

  it('supports multiplication expressions', () => {
    const multConfig = { ...baseConfig, expression: 'x * y', tolerance: 0.01 };
    const resp = { x: 3, y: 7 };
    expect(fieldComputedEvaluator('f', 21, multConfig, resp)).toBeNull();
    expect(fieldComputedEvaluator('f', 22, multConfig, resp)).not.toBeNull();
  });

  it('gracefully degrades when field values are missing', () => {
    const resp = { fieldA: 10 }; // fieldB missing
    expect(fieldComputedEvaluator('f', 30, config, resp)).toBeNull();
  });

  it('gracefully degrades when expression is not provided', () => {
    expect(fieldComputedEvaluator('f', 30, baseConfig, responses)).toBeNull();
  });

  it('uses default tolerance of 0.01', () => {
    const noTolConfig = { ...baseConfig, expression: 'fieldA + fieldB' };
    expect(fieldComputedEvaluator('f', 30.005, noTolConfig, responses)).toBeNull();
    expect(fieldComputedEvaluator('f', 30.02, noTolConfig, responses)).not.toBeNull();
  });
});
