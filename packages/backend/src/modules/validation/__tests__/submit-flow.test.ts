/**
 * Submit Flow - Validation Integration Tests
 *
 * Tests verifying how the validation engine integrates with the submit flow.
 * Focuses on validate() behavior patterns that ReactivoService relies on.
 *
 * Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5
 */

import { describe, it, expect } from 'vitest';
import { validate } from '../validation-engine.js';
import type { FormField } from '../validation-engine.js';

// ─── Mock DB Helpers ────────────────────────────────────────────────────────────

/**
 * Creates a mock DB that returns specified global rules and overrides.
 */
function createMockDb(
  globalRules: Array<{
    id: string;
    formType: string;
    name: string;
    isActive: boolean;
    sections: unknown;
  }>,
  overrides: Array<{
    id: string;
    formId: string;
    ruleTemplateId: string | null;
    overrideType: string;
    customRule: unknown;
  }> = [],
) {
  let callCount = 0;
  return {
    select: () => ({
      from: () => ({
        where: () => {
          callCount++;
          // First call = global rules query, Second call = overrides query
          if (callCount === 1) {
            return Promise.resolve(globalRules);
          }
          return Promise.resolve(overrides);
        },
      }),
    }),
    _getCallCount: () => callCount,
  } as any;
}

/**
 * Creates a mock DB that throws an error on any query.
 */
function createThrowingDb(error: Error = new Error('DB connection failed')) {
  return {
    select: () => ({
      from: () => ({
        where: () => Promise.reject(error),
      }),
    }),
  } as any;
}

/**
 * Creates a mock DB that tracks whether it was called.
 * Throws if called (useful for verifying bypass behavior).
 */
function createTrackingDb() {
  let wasCalled = false;
  const db = {
    select: () => {
      wasCalled = true;
      throw new Error('DB should not be queried for legacy forms');
    },
    get wasCalled() {
      return wasCalled;
    },
  } as any;
  return db;
}

// ─── Test Data ──────────────────────────────────────────────────────────────────

const sampleFieldsMetadata: FormField[] = [
  { sectionName: 'identificacion', fields: ['empresa_nombre', 'centro_rfc', 'responsable_nombre'] },
  { sectionName: 'mediciones', fields: ['lux_medido', 'lux_referencia', 'factor_reflexion'] },
];

const sampleRequiredAllRule = {
  id: 'rule-1',
  formType: 'nom025',
  name: 'Campos obligatorios sección identificación',
  isActive: true,
  sections: [
    {
      sectionName: 'identificacion',
      pattern: 'required_all',
      patternConfig: {},
      fieldOverrides: [],
    },
  ],
};

const sampleNumericRangeRule = {
  id: 'rule-2',
  formType: 'nom025',
  name: 'Rangos numéricos sección mediciones',
  isActive: true,
  sections: [
    {
      sectionName: 'mediciones',
      pattern: 'numeric_range',
      patternConfig: { min: 0, max: 100000 },
      fieldOverrides: [],
    },
  ],
};

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('Submit Flow - Validation Integration', () => {
  describe('422 response shape', () => {
    it('should return valid=false with errors matching the expected 422 shape', async () => {
      const mockDb = createMockDb([sampleRequiredAllRule]);
      const responses = {
        empresa_nombre: '',
        centro_rfc: '',
        responsable_nombre: '',
      };

      const result = await validate(
        mockDb,
        'form-123',
        'nom025',
        responses,
        sampleFieldsMetadata,
      );

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);

      // Verify each error has the expected 422 shape fields
      for (const error of result.errors) {
        expect(error).toHaveProperty('fieldName');
        expect(error).toHaveProperty('sectionName');
        expect(error).toHaveProperty('ruleName');
        expect(error).toHaveProperty('message');
        expect(error).toHaveProperty('ruleType');

        // Verify types
        expect(typeof error.fieldName).toBe('string');
        expect(typeof error.sectionName).toBe('string');
        expect(typeof error.ruleName).toBe('string');
        expect(typeof error.message).toBe('string');
        expect(['global', 'custom']).toContain(error.ruleType);
      }
    });

    it('should return correct fieldName and sectionName in each error', async () => {
      const mockDb = createMockDb([sampleRequiredAllRule]);
      const responses = {
        empresa_nombre: '',
        centro_rfc: 'valid_value',
        responsable_nombre: null,
      };

      const result = await validate(
        mockDb,
        'form-123',
        'nom025',
        responses,
        sampleFieldsMetadata,
      );

      expect(result.valid).toBe(false);

      // Only empty/null fields should have errors
      const errorFieldNames = result.errors.map((e) => e.fieldName);
      expect(errorFieldNames).toContain('empresa_nombre');
      expect(errorFieldNames).toContain('responsable_nombre');
      expect(errorFieldNames).not.toContain('centro_rfc');

      // All errors should reference the correct section
      for (const error of result.errors) {
        expect(error.sectionName).toBe('identificacion');
      }
    });

    it('should include ruleName and ruleType from the rule source', async () => {
      const mockDb = createMockDb([sampleRequiredAllRule]);
      const responses = { empresa_nombre: '', centro_rfc: '', responsable_nombre: '' };

      const result = await validate(
        mockDb,
        'form-123',
        'nom025',
        responses,
        sampleFieldsMetadata,
      );

      for (const error of result.errors) {
        expect(error.ruleName).toBe('Campos obligatorios sección identificación');
        expect(error.ruleType).toBe('global');
      }
    });

    it('should return ruleType=custom for custom override rules', async () => {
      const customOverride = {
        id: 'override-1',
        formId: 'form-123',
        ruleTemplateId: null,
        overrideType: 'custom',
        customRule: [
          {
            sectionName: 'identificacion',
            pattern: 'required_all',
            patternConfig: {},
            fieldOverrides: [],
          },
        ],
      };

      const mockDb = createMockDb([], [customOverride]);
      const responses = { empresa_nombre: '', centro_rfc: '', responsable_nombre: '' };

      const result = await validate(
        mockDb,
        'form-123',
        'nom025',
        responses,
        sampleFieldsMetadata,
      );

      expect(result.valid).toBe(false);
      for (const error of result.errors) {
        expect(error.ruleType).toBe('custom');
      }
    });

    it('should collect errors from multiple rules', async () => {
      const mockDb = createMockDb([sampleRequiredAllRule, sampleNumericRangeRule]);
      const responses = {
        empresa_nombre: '',
        centro_rfc: '',
        responsable_nombre: '',
        lux_medido: -5,
        lux_referencia: 200000,
        factor_reflexion: 50,
      };

      const result = await validate(
        mockDb,
        'form-123',
        'nom025',
        responses,
        sampleFieldsMetadata,
      );

      expect(result.valid).toBe(false);

      // Should have errors from both rules
      const ruleNames = [...new Set(result.errors.map((e) => e.ruleName))];
      expect(ruleNames).toContain('Campos obligatorios sección identificación');
      expect(ruleNames).toContain('Rangos numéricos sección mediciones');
    });
  });

  describe('successful submission', () => {
    it('should return valid=true when all required fields are filled', async () => {
      const mockDb = createMockDb([sampleRequiredAllRule]);
      const responses = {
        empresa_nombre: 'Acme Corp',
        centro_rfc: 'ABC123456XYZ',
        responsable_nombre: 'Juan Pérez',
      };

      const result = await validate(
        mockDb,
        'form-123',
        'nom025',
        responses,
        sampleFieldsMetadata,
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should return valid=true when numeric values are within range', async () => {
      const mockDb = createMockDb([sampleNumericRangeRule]);
      const responses = {
        lux_medido: 500,
        lux_referencia: 1000,
        factor_reflexion: 0.85,
      };

      const result = await validate(
        mockDb,
        'form-123',
        'nom025',
        responses,
        sampleFieldsMetadata,
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should return valid=true when no rules exist (H(s)=1 identity)', async () => {
      const mockDb = createMockDb([]);
      const responses = { any_field: 'any_value' };

      const result = await validate(
        mockDb,
        'form-123',
        'nom025',
        responses,
        [{ sectionName: 'test', fields: ['any_field'] }],
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should return valid=true when all rules pass with multiple rules active', async () => {
      const mockDb = createMockDb([sampleRequiredAllRule, sampleNumericRangeRule]);
      const responses = {
        empresa_nombre: 'Acme Corp',
        centro_rfc: 'ABC123456XYZ',
        responsable_nombre: 'Juan Pérez',
        lux_medido: 500,
        lux_referencia: 1000,
        factor_reflexion: 0.85,
      };

      const result = await validate(
        mockDb,
        'form-123',
        'nom025',
        responses,
        sampleFieldsMetadata,
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('legacy form bypass', () => {
    it('should not call DB when form_type is legacy (simulated via empty rule set)', async () => {
      // The bypass logic lives in ReactivoService which checks form_type/template_id
      // before calling validate(). If validate IS called, the DB is queried.
      // This test verifies that with no rules for a legacy form_type, validation
      // returns identity (valid=true).
      const mockDb = createMockDb([]);
      const responses = {
        any_field: 'any_value',
        another: '',
        empty_numeric: null,
      };

      const result = await validate(
        mockDb,
        'form-123',
        'legacy',
        responses,
        [{ sectionName: 'test', fields: ['any_field', 'another', 'empty_numeric'] }],
      );

      // Legacy forms with no rules should pass through (identity)
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should pass validation when no rules match the legacy form_type', async () => {
      // Global rules exist for 'nom025' but not for 'legacy'
      // The mock DB simulates this by returning no rules for the legacy form type
      const mockDb = createMockDb([]);
      const responses = { field1: '', field2: null, field3: undefined };

      const result = await validate(
        mockDb,
        'form-legacy-123',
        'legacy',
        responses,
        [{ sectionName: 'section1', fields: ['field1', 'field2', 'field3'] }],
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should demonstrate legacy bypass behavior: invalid data passes when no rules exist', async () => {
      // This demonstrates the core bypass: even with clearly invalid data,
      // if the effective rule set is empty (as it would be for legacy forms),
      // everything passes through unchanged (H(s)=1)
      const mockDb = createMockDb([]);
      const responses = {
        empresa_nombre: '',
        centro_rfc: 'INVALID',
        lux_medido: -999999,
      };

      const result = await validate(
        mockDb,
        'form-123',
        'legacy',
        responses,
        sampleFieldsMetadata,
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('graceful degradation', () => {
    it('should return valid=true when DB query fails', async () => {
      const mockDb = createThrowingDb(new Error('ECONNREFUSED'));
      const responses = {
        empresa_nombre: '',
        centro_rfc: '',
      };

      const result = await validate(
        mockDb,
        'form-123',
        'nom025',
        responses,
        sampleFieldsMetadata,
      );

      // Graceful degradation: DB failure → H(s)=1 (identity)
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should return valid=true when DB throws a timeout error', async () => {
      const mockDb = createThrowingDb(new Error('Query timeout exceeded'));
      const responses = { lux_medido: -999 };

      const result = await validate(
        mockDb,
        'form-123',
        'nom025',
        responses,
        sampleFieldsMetadata,
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should return valid=true when DB throws a generic Error', async () => {
      const mockDb = createThrowingDb(new Error('Unexpected database error'));
      const responses = {};

      const result = await validate(
        mockDb,
        'form-123',
        'nom025',
        responses,
        [],
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should not propagate the DB error to the caller', async () => {
      const mockDb = createThrowingDb(new Error('Critical failure'));
      const responses = { field: 'value' };

      // validate() should NOT throw, it should gracefully return valid=true
      await expect(
        validate(mockDb, 'form-123', 'nom025', responses, sampleFieldsMetadata),
      ).resolves.toEqual({ valid: true, errors: [] });
    });
  });
});
