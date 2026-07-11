// Feature: ensayo-tecnico, Property 1: Schema validation correctness
// Validates: Requirements 3.1, 3.2

import fc from 'fast-check';
import { validateResponses } from './schema-validator';

/**
 * Arbitraries for generating random JSON Schema properties and valid/invalid responses.
 */

// Generate a random string property with optional constraints
const stringPropertyArb = fc.record({
  type: fc.constant('string' as const),
  minLength: fc.option(fc.integer({ min: 0, max: 5 }), { nil: undefined }),
  maxLength: fc.option(fc.integer({ min: 5, max: 50 }), { nil: undefined }),
  enum: fc.option(
    fc.array(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 1, maxLength: 5 }),
    { nil: undefined },
  ),
});

// Generate a random number property with optional constraints
const numberPropertyArb = fc.record({
  type: fc.constantFrom('number' as const, 'integer' as const),
  minimum: fc.option(fc.integer({ min: -100, max: 0 }), { nil: undefined }),
  maximum: fc.option(fc.integer({ min: 1, max: 100 }), { nil: undefined }),
});

// Generate a random boolean property
const booleanPropertyArb = fc.record({
  type: fc.constant('boolean' as const),
});

// Generate a random array property
const arrayPropertyArb = fc.record({
  type: fc.constant('array' as const),
});

// Union of all property types
const schemaPropertyArb = fc.oneof(
  stringPropertyArb,
  numberPropertyArb,
  booleanPropertyArb,
  arrayPropertyArb,
);

// Generate a field name (valid identifier-like string)
const fieldNameArb = fc.string({ minLength: 1, maxLength: 12 }).filter((s) => /^[a-z][a-z0-9_]*$/.test(s));

/**
 * Generate a valid value for a given schema property definition.
 */
function validValueForProperty(prop: {
  type: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  enum?: string[];
}): fc.Arbitrary<unknown> {
  switch (prop.type) {
    case 'string': {
      if (prop.enum && prop.enum.length > 0) {
        return fc.constantFrom(...prop.enum);
      }
      const minLen = prop.minLength ?? 0;
      const maxLen = prop.maxLength ?? 50;
      const effectiveMax = Math.max(minLen, maxLen);
      return fc.string({ minLength: minLen, maxLength: effectiveMax });
    }
    case 'number': {
      const min = prop.minimum ?? -1000;
      const max = prop.maximum ?? 1000;
      return fc.double({ min, max, noNaN: true, noDefaultInfinity: true });
    }
    case 'integer': {
      const min = prop.minimum ?? -1000;
      const max = prop.maximum ?? 1000;
      return fc.integer({ min, max });
    }
    case 'boolean':
      return fc.boolean();
    case 'array':
      return fc.array(fc.anything(), { maxLength: 5 });
    default:
      return fc.anything();
  }
}

/**
 * Generate an invalid value for a given schema property (wrong type).
 */
function invalidValueForProperty(prop: { type: string }): fc.Arbitrary<unknown> {
  switch (prop.type) {
    case 'string':
      // Return a number instead of string
      return fc.integer();
    case 'number':
    case 'integer':
      // Return a string instead of number
      return fc.string({ minLength: 1 });
    case 'boolean':
      // Return a string instead of boolean
      return fc.string({ minLength: 1 });
    case 'array':
      // Return a string instead of array
      return fc.string({ minLength: 1 });
    default:
      return fc.constant(null);
  }
}

/**
 * Generate a random JSON Schema with 1–5 properties, some required.
 */
const jsonSchemaArb = fc
  .set(fieldNameArb, { minLength: 1, maxLength: 5 })
  .chain((fieldNames) =>
    fc.tuple(
      fc.tuple(...fieldNames.map(() => schemaPropertyArb)),
      fc.subarray(fieldNames, { minLength: 0 }),
    ).map(([props, requiredFields]) => {
      const properties: Record<string, unknown> = {};
      fieldNames.forEach((name, i) => {
        properties[name] = props[i];
      });
      return {
        type: 'object' as const,
        properties,
        required: requiredFields,
      };
    }),
  );

/**
 * Given a schema, generate a fully valid responses object.
 */
function validResponsesForSchema(schema: {
  properties: Record<string, { type: string; minLength?: number; maxLength?: number; minimum?: number; maximum?: number; enum?: string[] }>;
  required?: string[];
}): fc.Arbitrary<Record<string, unknown>> {
  const requiredFields = new Set(schema.required ?? []);
  const entries = Object.entries(schema.properties);

  if (entries.length === 0) {
    return fc.constant({});
  }

  // For required fields, always generate valid values.
  // For optional fields, sometimes include them (with valid values), sometimes omit.
  const arbs = entries.map(([name, prop]) => {
    const valueArb = validValueForProperty(prop);
    if (requiredFields.has(name)) {
      return valueArb.map((v) => [name, v] as [string, unknown]);
    }
    // Optional: 50% chance include, 50% omit
    return fc.option(valueArb, { nil: undefined }).map((v) =>
      v !== undefined ? ([name, v] as [string, unknown]) : null,
    );
  });

  return fc.tuple(...arbs).map((pairs) => {
    const result: Record<string, unknown> = {};
    for (const pair of pairs) {
      if (pair !== null) {
        const [key, value] = pair as [string, unknown];
        result[key] = value;
      }
    }
    return result;
  });
}

describe('validateResponses — Property-based tests', () => {
  it('should accept valid responses that satisfy all schema constraints', () => {
    fc.assert(
      fc.property(
        jsonSchemaArb.chain((schema) =>
          validResponsesForSchema(
            schema as {
              properties: Record<string, { type: string; minLength?: number; maxLength?: number; minimum?: number; maximum?: number; enum?: string[] }>;
              required?: string[];
            },
          ).map((responses) => ({ schema, responses })),
        ),
        ({ schema, responses }) => {
          const result = validateResponses(responses, schema);
          expect(result).toEqual({ valid: true });
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should reject responses missing required fields with field-specific errors', () => {
    // Generate schemas that have at least one required field
    const schemaWithRequiredArb = fc
      .set(fieldNameArb, { minLength: 1, maxLength: 5 })
      .chain((fieldNames) =>
        fc.tuple(
          fc.tuple(...fieldNames.map(() => schemaPropertyArb)),
          fc.subarray(fieldNames, { minLength: 1 }), // At least one required
        ).map(([props, requiredFields]) => {
          const properties: Record<string, unknown> = {};
          fieldNames.forEach((name, i) => {
            properties[name] = props[i];
          });
          return {
            type: 'object' as const,
            properties,
            required: requiredFields,
          };
        }),
      );

    fc.assert(
      fc.property(
        schemaWithRequiredArb.chain((schema) =>
          // Pick at least one required field to omit
          fc.subarray(schema.required as string[], { minLength: 1 }).map((fieldsToOmit) => ({
            schema,
            fieldsToOmit,
          })),
        ),
        ({ schema, fieldsToOmit }) => {
          // Build a valid response, then remove the chosen required fields
          const responses: Record<string, unknown> = {};
          const requiredFields = new Set(schema.required ?? []);
          const omitSet = new Set(fieldsToOmit);

          for (const [name, prop] of Object.entries(
            schema.properties as Record<string, { type: string }>,
          )) {
            if (omitSet.has(name)) continue; // Omit this required field
            // Provide a simple valid value for the rest
            if (requiredFields.has(name) || Math.random() > 0.5) {
              switch (prop.type) {
                case 'string':
                  responses[name] = 'test_value';
                  break;
                case 'number':
                case 'integer':
                  responses[name] = 0;
                  break;
                case 'boolean':
                  responses[name] = true;
                  break;
                case 'array':
                  responses[name] = [];
                  break;
              }
            }
          }

          const result = validateResponses(responses, schema);
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.errors.length).toBeGreaterThan(0);
            // Verify at least one error references one of the omitted fields
            const hasFieldError = result.errors.some((err) =>
              fieldsToOmit.some((field) => err.includes(field)),
            );
            expect(hasFieldError).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should reject responses with wrong types and provide field-specific errors', () => {
    // Generate schemas with at least one required field, then provide a wrong-type value
    const schemaWithRequiredArb = fc
      .set(fieldNameArb, { minLength: 1, maxLength: 5 })
      .chain((fieldNames) =>
        fc.tuple(
          fc.tuple(...fieldNames.map(() => schemaPropertyArb)),
          fc.subarray(fieldNames, { minLength: 1 }), // At least one required
        ).map(([props, requiredFields]) => {
          const properties: Record<string, unknown> = {};
          fieldNames.forEach((name, i) => {
            properties[name] = props[i];
          });
          return {
            type: 'object' as const,
            properties,
            required: requiredFields,
          };
        }),
      );

    fc.assert(
      fc.property(
        schemaWithRequiredArb.chain((schema) =>
          // Pick one required field to supply a wrong-type value
          fc.constantFrom(...(schema.required as string[])).chain((targetField) => {
            const prop = (schema.properties as Record<string, { type: string }>)[targetField];
            return invalidValueForProperty(prop).map((badValue) => ({
              schema,
              targetField,
              badValue,
            }));
          }),
        ),
        ({ schema, targetField, badValue }) => {
          // Build a response with all required fields valid except the target
          const responses: Record<string, unknown> = {};
          const requiredFields = schema.required as string[];

          for (const name of requiredFields) {
            const prop = (schema.properties as Record<string, { type: string }>)[name];
            if (name === targetField) {
              responses[name] = badValue;
            } else {
              switch (prop.type) {
                case 'string':
                  responses[name] = 'valid_string';
                  break;
                case 'number':
                case 'integer':
                  responses[name] = 0;
                  break;
                case 'boolean':
                  responses[name] = true;
                  break;
                case 'array':
                  responses[name] = [];
                  break;
              }
            }
          }

          const result = validateResponses(responses, schema);
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.errors.length).toBeGreaterThan(0);
            // Error should reference the target field
            const hasFieldError = result.errors.some((err) => err.includes(targetField));
            expect(hasFieldError).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
