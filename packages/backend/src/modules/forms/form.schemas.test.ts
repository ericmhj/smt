import { describe, it, expect } from 'vitest';
import { associateTemplateSchema } from './form.schemas';

describe('associateTemplateSchema', () => {
  it('should accept a valid UUID templateId', () => {
    const result = associateTemplateSchema.safeParse({
      templateId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(true);
  });

  it('should reject a missing templateId', () => {
    const result = associateTemplateSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('should reject a non-UUID templateId', () => {
    const result = associateTemplateSchema.safeParse({
      templateId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('should reject an empty string templateId', () => {
    const result = associateTemplateSchema.safeParse({
      templateId: '',
    });
    expect(result.success).toBe(false);
  });

  it('should ignore extra fields', () => {
    const result = associateTemplateSchema.safeParse({
      templateId: '550e8400-e29b-41d4-a716-446655440000',
      extraField: 'ignored',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        templateId: '550e8400-e29b-41d4-a716-446655440000',
      });
    }
  });
});
