import { describe, it, expect } from 'vitest';
import {
  validateStructure,
  FieldsMetadata,
} from './structural-validator';

describe('structural-validator', () => {
  const baseMetadata: FieldsMetadata = {
    sections: [
      {
        sectionName: 'identificacion',
        fields: ['empresa_nombre', 'centro_rfc', 'responsable_nombre'],
      },
      {
        sectionName: 'mediciones',
        fields: ['lux_medido', 'lux_referencia'],
      },
    ],
  };

  describe('validateStructure', () => {
    it('should return valid when all fields and sections are present', () => {
      const html = `
        <html><body>
          <div class="section-heading">identificacion</div>
          <input name="empresa_nombre" />
          <input name="centro_rfc" />
          <input name="responsable_nombre" />
          <div data-section="mediciones">Mediciones</div>
          <input name="lux_medido" />
          <input name="lux_referencia" />
        </body></html>
      `;

      const result = validateStructure(html, baseMetadata);

      expect(result.valid).toBe(true);
      expect(result.missingFields).toEqual([]);
      expect(result.missingSections).toEqual([]);
    });

    it('should detect missing fields', () => {
      const html = `
        <html><body>
          <div class="section-heading">identificacion</div>
          <input name="empresa_nombre" />
          <div data-section="mediciones">Mediciones</div>
          <input name="lux_medido" />
          <input name="lux_referencia" />
        </body></html>
      `;

      const result = validateStructure(html, baseMetadata);

      expect(result.valid).toBe(false);
      expect(result.missingFields).toContain('centro_rfc');
      expect(result.missingFields).toContain('responsable_nombre');
      expect(result.missingSections).toEqual([]);
    });

    it('should detect missing sections', () => {
      const html = `
        <html><body>
          <div class="section-heading">identificacion</div>
          <input name="empresa_nombre" />
          <input name="centro_rfc" />
          <input name="responsable_nombre" />
          <input name="lux_medido" />
          <input name="lux_referencia" />
        </body></html>
      `;

      const result = validateStructure(html, baseMetadata);

      expect(result.valid).toBe(false);
      expect(result.missingFields).toEqual([]);
      expect(result.missingSections).toContain('mediciones');
    });

    it('should detect both missing fields and sections', () => {
      const html = `
        <html><body>
          <input name="empresa_nombre" />
        </body></html>
      `;

      const result = validateStructure(html, baseMetadata);

      expect(result.valid).toBe(false);
      expect(result.missingFields).toContain('centro_rfc');
      expect(result.missingFields).toContain('responsable_nombre');
      expect(result.missingFields).toContain('lux_medido');
      expect(result.missingFields).toContain('lux_referencia');
      expect(result.missingSections).toContain('identificacion');
      expect(result.missingSections).toContain('mediciones');
    });

    it('should allow additional cosmetic elements without failing', () => {
      const html = `
        <html><body>
          <div class="header"><img src="logo.png" /><h1>Custom Branding</h1></div>
          <div class="section-heading">identificacion</div>
          <input name="empresa_nombre" />
          <input name="centro_rfc" />
          <input name="responsable_nombre" />
          <div class="decorative-line"></div>
          <div data-section="mediciones">Mediciones</div>
          <input name="lux_medido" />
          <input name="lux_referencia" />
          <span class="extra-label">Extra text</span>
          <input name="extra_custom_field" />
          <footer>Custom footer</footer>
        </body></html>
      `;

      const result = validateStructure(html, baseMetadata);

      expect(result.valid).toBe(true);
      expect(result.missingFields).toEqual([]);
      expect(result.missingSections).toEqual([]);
    });

    it('should be order-independent for fields', () => {
      const html = `
        <html><body>
          <div data-section="mediciones">Mediciones</div>
          <input name="lux_referencia" />
          <input name="lux_medido" />
          <div class="section-heading">identificacion</div>
          <input name="responsable_nombre" />
          <input name="centro_rfc" />
          <input name="empresa_nombre" />
        </body></html>
      `;

      const result = validateStructure(html, baseMetadata);

      expect(result.valid).toBe(true);
      expect(result.missingFields).toEqual([]);
      expect(result.missingSections).toEqual([]);
    });

    it('should match field names case-sensitively', () => {
      const html = `
        <html><body>
          <div class="section-heading">identificacion</div>
          <input name="Empresa_Nombre" />
          <input name="centro_rfc" />
          <input name="responsable_nombre" />
          <div data-section="mediciones">Mediciones</div>
          <input name="lux_medido" />
          <input name="lux_referencia" />
        </body></html>
      `;

      const result = validateStructure(html, baseMetadata);

      expect(result.valid).toBe(false);
      expect(result.missingFields).toContain('empresa_nombre');
    });

    it('should match section names case-sensitively', () => {
      const html = `
        <html><body>
          <div class="section-heading">Identificacion</div>
          <input name="empresa_nombre" />
          <input name="centro_rfc" />
          <input name="responsable_nombre" />
          <div data-section="mediciones">Mediciones</div>
          <input name="lux_medido" />
          <input name="lux_referencia" />
        </body></html>
      `;

      const result = validateStructure(html, baseMetadata);

      expect(result.valid).toBe(false);
      expect(result.missingSections).toContain('identificacion');
    });

    it('should recognize sections via data-section attribute', () => {
      const html = `
        <html><body>
          <div data-section="identificacion">ID Section</div>
          <input name="empresa_nombre" />
          <input name="centro_rfc" />
          <input name="responsable_nombre" />
          <div data-section="mediciones">Measurements</div>
          <input name="lux_medido" />
          <input name="lux_referencia" />
        </body></html>
      `;

      const result = validateStructure(html, baseMetadata);

      expect(result.valid).toBe(true);
      expect(result.missingFields).toEqual([]);
      expect(result.missingSections).toEqual([]);
    });

    it('should recognize sections via section-heading class text content', () => {
      const html = `
        <html><body>
          <h2 class="section-heading">identificacion</h2>
          <input name="empresa_nombre" />
          <input name="centro_rfc" />
          <input name="responsable_nombre" />
          <h2 class="section-heading">mediciones</h2>
          <input name="lux_medido" />
          <input name="lux_referencia" />
        </body></html>
      `;

      const result = validateStructure(html, baseMetadata);

      expect(result.valid).toBe(true);
      expect(result.missingFields).toEqual([]);
      expect(result.missingSections).toEqual([]);
    });

    it('should handle empty tenant HTML', () => {
      const result = validateStructure('', baseMetadata);

      expect(result.valid).toBe(false);
      expect(result.missingFields.length).toBe(5);
      expect(result.missingSections.length).toBe(2);
    });

    it('should handle empty metadata (no required sections or fields)', () => {
      const emptyMetadata: FieldsMetadata = { sections: [] };
      const html = '<html><body><p>Any content</p></body></html>';

      const result = validateStructure(html, emptyMetadata);

      expect(result.valid).toBe(true);
      expect(result.missingFields).toEqual([]);
      expect(result.missingSections).toEqual([]);
    });

    it('should extract name attributes from various element types', () => {
      const metadata: FieldsMetadata = {
        sections: [
          {
            sectionName: 'form_section',
            fields: ['field_input', 'field_select', 'field_textarea'],
          },
        ],
      };

      const html = `
        <html><body>
          <div data-section="form_section">Section</div>
          <input name="field_input" />
          <select name="field_select"><option>A</option></select>
          <textarea name="field_textarea"></textarea>
        </body></html>
      `;

      const result = validateStructure(html, metadata);

      expect(result.valid).toBe(true);
    });
  });
});
