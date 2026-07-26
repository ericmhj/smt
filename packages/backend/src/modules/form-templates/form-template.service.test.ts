import { describe, it, expect } from 'vitest';
import { FormTemplateService } from './form-template.service.js';

describe('FormTemplateService.extractFieldsMetadata', () => {
  it('extracts fields grouped by section headings', () => {
    const html = `
      <div class="section-heading">identificacion</div>
      <input name="empresa_nombre" type="text" />
      <input name="centro_rfc" type="text" />
      <div class="section-heading">mediciones</div>
      <input name="lux_medido" type="number" />
      <input name="lux_referencia" type="number" />
    `;

    const result = FormTemplateService.extractFieldsMetadata(html);

    expect(result.sections).toHaveLength(2);
    expect(result.sections[0]).toEqual({
      sectionName: 'identificacion',
      fields: ['empresa_nombre', 'centro_rfc'],
    });
    expect(result.sections[1]).toEqual({
      sectionName: 'mediciones',
      fields: ['lux_medido', 'lux_referencia'],
    });
  });

  it('extracts sections from data-section attributes', () => {
    const html = `
      <div data-section="datos_generales">
        <input name="nombre" type="text" />
        <input name="apellido" type="text" />
      </div>
      <div data-section="contacto">
        <input name="email" type="email" />
      </div>
    `;

    const result = FormTemplateService.extractFieldsMetadata(html);

    expect(result.sections).toHaveLength(2);
    expect(result.sections[0].sectionName).toBe('datos_generales');
    expect(result.sections[0].fields).toEqual(['nombre', 'apellido']);
    expect(result.sections[1].sectionName).toBe('contacto');
    expect(result.sections[1].fields).toEqual(['email']);
  });

  it('creates a default section for fields before any heading', () => {
    const html = `
      <input name="orphan_field" type="text" />
      <div class="section-heading">section1</div>
      <input name="field1" type="text" />
    `;

    const result = FormTemplateService.extractFieldsMetadata(html);

    expect(result.sections).toHaveLength(2);
    expect(result.sections[0]).toEqual({
      sectionName: 'default',
      fields: ['orphan_field'],
    });
    expect(result.sections[1]).toEqual({
      sectionName: 'section1',
      fields: ['field1'],
    });
  });

  it('ignores duplicate field names', () => {
    const html = `
      <div class="section-heading">section1</div>
      <input name="field1" type="text" />
      <input name="field1" type="text" />
      <input name="field2" type="text" />
    `;

    const result = FormTemplateService.extractFieldsMetadata(html);

    expect(result.sections[0].fields).toEqual(['field1', 'field2']);
  });

  it('returns empty sections for HTML with no fields or headings', () => {
    const html = '<div><p>No form content</p></div>';

    const result = FormTemplateService.extractFieldsMetadata(html);

    expect(result.sections).toHaveLength(0);
  });

  it('handles select and textarea elements', () => {
    const html = `
      <div class="section-heading">form_fields</div>
      <select name="country"><option>Mexico</option></select>
      <textarea name="comments"></textarea>
    `;

    const result = FormTemplateService.extractFieldsMetadata(html);

    expect(result.sections[0].fields).toEqual(['country', 'comments']);
  });
});
