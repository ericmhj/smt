/**
 * Structural Validator
 *
 * Validates tenant HTML against a parent form template's fields_metadata
 * at form creation time. Ensures all required sections and fields defined
 * in the parent template are present in the tenant's HTML.
 *
 * - Extracts field `name` attributes from tenant HTML
 * - Extracts section identifiers (class="section-heading" or data-section)
 * - Compares against parent template metadata
 * - Order-independent: only presence matters
 * - Additional cosmetic elements are allowed
 *
 * @module structural-validator
 * @requirements 18.1, 18.2, 18.3, 18.4, 18.5
 */

import { JSDOM } from 'jsdom';

/**
 * Result of structural validation comparing tenant HTML to parent template.
 */
export interface StructuralValidationResult {
  valid: boolean;
  missingFields: string[];
  missingSections: string[];
}

/**
 * Metadata describing the sections and fields in a parent form template.
 * Mirrors the `fields_metadata` JSONB stored in `public.form_templates`.
 */
export interface FieldsMetadata {
  sections: Array<{
    sectionName: string;
    fields: string[];
  }>;
}

/**
 * Validates that tenant HTML contains all required sections and fields
 * defined in the parent template's fields_metadata.
 *
 * Matching rules:
 * - Field names are matched by `name` attribute (case-sensitive, exact match)
 * - Section identifiers are matched by elements with class `section-heading`
 *   (text content) or `data-section` attribute value
 * - Order of sections and fields does NOT matter
 * - Additional cosmetic elements in tenant HTML are allowed
 *
 * @param tenantHtml - The tenant's submitted HTML string
 * @param parentFieldsMetadata - The parent template's fields_metadata structure
 * @returns StructuralValidationResult indicating validity and any missing elements
 */
export function validateStructure(
  tenantHtml: string,
  parentFieldsMetadata: FieldsMetadata,
): StructuralValidationResult {
  const dom = new JSDOM(tenantHtml);
  const document = dom.window.document;

  // Extract all field name attributes from tenant HTML
  const fieldElements = document.querySelectorAll('[name]');
  const extractedFieldNames = new Set<string>();
  for (const el of fieldElements) {
    const name = el.getAttribute('name');
    if (name) {
      extractedFieldNames.add(name);
    }
  }

  // Extract section identifiers from tenant HTML
  // Look for elements with class "section-heading" (use text content)
  // or elements with data-section attribute (use attribute value)
  const extractedSections = new Set<string>();

  const sectionHeadings = document.querySelectorAll('.section-heading');
  for (const el of sectionHeadings) {
    const text = el.textContent?.trim();
    if (text) {
      extractedSections.add(text);
    }
  }

  const dataSectionElements = document.querySelectorAll('[data-section]');
  for (const el of dataSectionElements) {
    const sectionValue = el.getAttribute('data-section');
    if (sectionValue) {
      extractedSections.add(sectionValue);
    }
  }

  // Compare: collect all required fields and sections from parent metadata
  const requiredFields: string[] = [];
  const requiredSections: string[] = [];

  for (const section of parentFieldsMetadata.sections) {
    // Skip the "default" section — it's a parser artifact for fields before any section heading
    if (section.sectionName === 'default') {
      // Still require the fields from the default section, just not the section heading itself
      for (const field of section.fields) {
        requiredFields.push(field);
      }
      continue;
    }
    requiredSections.push(section.sectionName);
    for (const field of section.fields) {
      requiredFields.push(field);
    }
  }

  // Find missing fields (case-sensitive, order-independent)
  const missingFields = requiredFields.filter(
    (field) => !extractedFieldNames.has(field),
  );

  // Find missing sections (case-sensitive, order-independent)
  const missingSections = requiredSections.filter(
    (section) => !extractedSections.has(section),
  );

  return {
    valid: missingFields.length === 0 && missingSections.length === 0,
    missingFields,
    missingSections,
  };
}
