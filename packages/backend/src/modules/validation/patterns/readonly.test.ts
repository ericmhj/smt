import { describe, expect, it } from 'vitest';

import { readonlyEvaluator } from './readonly.js';

describe('readonlyEvaluator', () => {
  const baseConfig = {
    sectionName: 'identificacion',
    ruleName: 'Campos de solo lectura',
    ruleType: 'global' as const,
  };

  it('returns empty array when previousResponses is undefined', () => {
    const result = readonlyEvaluator(
      ['field1', 'field2'],
      { field1: 'value1', field2: 'value2' },
      baseConfig,
      undefined,
    );
    expect(result).toEqual([]);
  });

  it('returns empty array when previousResponses is null-ish', () => {
    const result = readonlyEvaluator(
      ['field1'],
      { field1: 'value1' },
      baseConfig,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      null as any,
    );
    expect(result).toEqual([]);
  });

  it('returns empty array when all values are unchanged', () => {
    const result = readonlyEvaluator(
      ['field1', 'field2'],
      { field1: 'same', field2: '123' },
      baseConfig,
      { field1: 'same', field2: '123' },
    );
    expect(result).toEqual([]);
  });

  it('returns error for each field that differs from previous', () => {
    const result = readonlyEvaluator(
      ['field1', 'field2', 'field3'],
      { field1: 'changed', field2: 'same', field3: 'also_changed' },
      baseConfig,
      { field1: 'original', field2: 'same', field3: 'was_this' },
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      fieldName: 'field1',
      sectionName: 'identificacion',
      ruleName: 'Campos de solo lectura',
      message: 'Este campo es de solo lectura y no puede ser modificado',
      ruleType: 'global',
    });
    expect(result[1].fieldName).toBe('field3');
  });

  it('uses loose string comparison (null vs empty string treated equal)', () => {
    const result = readonlyEvaluator(
      ['field1'],
      { field1: null },
      baseConfig,
      { field1: undefined },
    );
    // String(null ?? '') === '' and String(undefined ?? '') === '' → no difference
    expect(result).toEqual([]);
  });

  it('detects change from undefined to a value', () => {
    const result = readonlyEvaluator(
      ['field1'],
      { field1: 'new_value' },
      baseConfig,
      { field1: undefined },
    );
    expect(result).toHaveLength(1);
    expect(result[0].fieldName).toBe('field1');
  });

  it('detects change from value to empty/undefined', () => {
    const result = readonlyEvaluator(
      ['field1'],
      { field1: undefined },
      baseConfig,
      { field1: 'old_value' },
    );
    expect(result).toHaveLength(1);
  });

  it('uses config metadata in error output', () => {
    const customConfig = {
      sectionName: 'mediciones',
      ruleName: 'Read-only mediciones',
      ruleType: 'custom' as const,
    };
    const result = readonlyEvaluator(
      ['lux_medido'],
      { lux_medido: '500' },
      customConfig,
      { lux_medido: '300' },
    );
    expect(result[0]).toEqual({
      fieldName: 'lux_medido',
      sectionName: 'mediciones',
      ruleName: 'Read-only mediciones',
      message: 'Este campo es de solo lectura y no puede ser modificado',
      ruleType: 'custom',
    });
  });

  it('handles numeric vs string comparison correctly (loose comparison)', () => {
    // String(123) === '123' so these should be treated as the same
    const result = readonlyEvaluator(
      ['field1'],
      { field1: 123 },
      baseConfig,
      { field1: '123' },
    );
    expect(result).toEqual([]);
  });
});
