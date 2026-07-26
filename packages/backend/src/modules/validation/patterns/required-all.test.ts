import { describe, it, expect } from 'vitest';
import { requiredAllEvaluator } from './required-all.js';
import type { PatternConfig } from '../validation.types.js';

describe('requiredAllEvaluator', () => {
  const baseConfig: PatternConfig = {
    sectionName: 'identificacion',
    ruleName: 'Campos obligatorios',
    ruleType: 'global',
  };

  it('returns no errors when all fields have non-empty values', () => {
    const fields = ['nombre', 'empresa', 'rfc'];
    const responses = { nombre: 'Juan', empresa: 'ACME', rfc: 'ABC123456XYZ' };

    const errors = requiredAllEvaluator(fields, responses, baseConfig);

    expect(errors).toEqual([]);
  });

  it('returns an error for each null field', () => {
    const fields = ['nombre', 'empresa'];
    const responses = { nombre: null, empresa: 'ACME' };

    const errors = requiredAllEvaluator(fields, responses, baseConfig);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toEqual({
      fieldName: 'nombre',
      sectionName: 'identificacion',
      ruleName: 'Campos obligatorios',
      message: 'El campo es obligatorio',
      ruleType: 'global',
    });
  });

  it('returns an error for each undefined field', () => {
    const fields = ['nombre', 'empresa'];
    const responses = { empresa: 'ACME' }; // nombre is undefined

    const errors = requiredAllEvaluator(fields, responses, baseConfig);

    expect(errors).toHaveLength(1);
    expect(errors[0].fieldName).toBe('nombre');
  });

  it('returns an error for each empty string field', () => {
    const fields = ['nombre', 'empresa'];
    const responses = { nombre: '', empresa: 'ACME' };

    const errors = requiredAllEvaluator(fields, responses, baseConfig);

    expect(errors).toHaveLength(1);
    expect(errors[0].fieldName).toBe('nombre');
  });

  it('returns errors for multiple failing fields', () => {
    const fields = ['a', 'b', 'c'];
    const responses = { a: null, b: undefined, c: '' };

    const errors = requiredAllEvaluator(fields, responses, baseConfig);

    expect(errors).toHaveLength(3);
    expect(errors.map((e) => e.fieldName)).toEqual(['a', 'b', 'c']);
  });

  it('uses default values when config properties are missing', () => {
    const fields = ['nombre'];
    const responses = { nombre: null };
    const emptyConfig: PatternConfig = {};

    const errors = requiredAllEvaluator(fields, responses, emptyConfig);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toEqual({
      fieldName: 'nombre',
      sectionName: '',
      ruleName: '',
      message: 'El campo es obligatorio',
      ruleType: 'global',
    });
  });

  it('does not flag fields with non-empty values like 0 or false', () => {
    const fields = ['count', 'active'];
    const responses = { count: 0, active: false };

    const errors = requiredAllEvaluator(fields, responses, baseConfig);

    expect(errors).toEqual([]);
  });

  it('returns no errors for an empty fields list', () => {
    const errors = requiredAllEvaluator([], {}, baseConfig);

    expect(errors).toEqual([]);
  });
});
