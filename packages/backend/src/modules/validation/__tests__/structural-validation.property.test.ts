// Feature: validation-rules-engine, Property 13: Structural validation passes iff all parent fields and sections exist

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  validateStructure,
  FieldsMetadata,
} from '../structural-validator';

/**
 * Validates: Requirements 17.2, 17.3, 17.4, 18.1, 18.2, 18.3, 18.4, 18.5
 *
 * Property 13: Structural validation passes iff all parent fields and sections
 * exist in tenant HTML. Additional cosmetic elements do not cause failure.
 */

// --- Helper Functions ---

/**
 * Generates HTML containing the specified sections and fields, with optional extra elements.
 */
function generateHtml(sections: string[], fields: string[], extraElements?: string[]): string {
  let html = '<html><body>';
  for (const s of sections) html += `<div data-section="${s}">${s}</div>`;
  for (const f of fields) html += `<input name="${f}" />`;
  if (extraElements) for (const e of extraElements) html += e;
  html += '</body></html>';
  return html;
}

/**
 * Builds a FieldsMetadata object from section names and their associated fields.
 */
function buildMetadata(
  sectionEntries: Array<{ sectionName: string; fields: string[] }>,
): FieldsMetadata {
  return { sections: sectionEntries };
}

// --- Arbitraries ---

/**
 * Generates a valid identifier-like string suitable for field/section names.
 * Avoids empty strings and special HTML characters.
 */
const identifierArb = fc
  .stringMatching(/^[a-z][a-z0-9_]{0,19}$/)
  .filter((s) => s.length > 0);

/**
 * Generates a unique array of identifiers of the specified size range.
 */
function uniqueIdentifiers(minLength: number, maxLength: number) {
  return fc
    .uniqueArray(identifierArb, { minLength, maxLength })
    .filter((arr) => arr.length >= minLength);
}

/**
 * Generates section entries (sectionName + fields) for parent metadata.
 */
const sectionEntryArb = fc.record({
  sectionName: identifierArb,
  fields: uniqueIdentifiers(1, 10),
});

/**
 * Generates 1-5 section entries with unique section names.
 */
const metadataSectionsArb = fc
  .uniqueArray(sectionEntryArb, {
    minLength: 1,
    maxLength: 5,
    selector: (entry) => entry.sectionName,
  })
  .filter((arr) => arr.length >= 1);

/**
 * Generates extra cosmetic HTML elements that should not affect validation.
 */
const extraElementsArb = fc.array(
  fc.oneof(
    fc.constant('<div class="branding">Logo here</div>'),
    fc.constant('<span class="decorative">---</span>'),
    fc.constant('<img src="logo.png" alt="logo" />'),
    fc.constant('<footer>Copyright 2024</footer>'),
    fc.constant('<p class="note">Additional note</p>'),
    // Extra inputs with names NOT in the metadata (random unrelated names)
    fc.stringMatching(/^extra_[a-z]{3,8}$/).map(
      (name) => `<input name="${name}" />`,
    ),
  ),
  { minLength: 0, maxLength: 5 },
);

// --- Property Tests ---

describe('Structural Validation - Property 13', () => {
  it('should return valid: true when ALL parent fields and sections exist in tenant HTML', () => {
    fc.assert(
      fc.property(metadataSectionsArb, (sectionEntries) => {
        const metadata = buildMetadata(sectionEntries);

        // Collect all fields and section names from metadata
        const allSections = sectionEntries.map((s) => s.sectionName);
        const allFields = sectionEntries.flatMap((s) => s.fields);

        // Generate HTML that includes all sections and fields
        const html = generateHtml(allSections, allFields);

        const result = validateStructure(html, metadata);

        expect(result.valid).toBe(true);
        expect(result.missingFields).toEqual([]);
        expect(result.missingSections).toEqual([]);
      }),
      { numRuns: 100 },
    );
  });

  it('should return valid: false with correct missingFields when fields are removed from HTML', () => {
    fc.assert(
      fc.property(
        metadataSectionsArb.filter((entries) =>
          entries.flatMap((s) => s.fields).length > 0,
        ),
        fc.context(),
        (sectionEntries, ctx) => {
          const metadata = buildMetadata(sectionEntries);

          const allSections = sectionEntries.map((s) => s.sectionName);
          const allFields = sectionEntries.flatMap((s) => s.fields);

          // Remove a random non-empty subset of fields
          // Use a deterministic approach: remove at least 1 field
          const removeCount = Math.max(1, Math.floor(allFields.length / 2));
          const removedFields = allFields.slice(0, removeCount);
          const keptFields = allFields.slice(removeCount);

          ctx.log(`All fields: ${allFields.join(', ')}`);
          ctx.log(`Removed: ${removedFields.join(', ')}`);
          ctx.log(`Kept: ${keptFields.join(', ')}`);

          // Generate HTML with all sections but only kept fields
          const html = generateHtml(allSections, keptFields);

          const result = validateStructure(html, metadata);

          expect(result.valid).toBe(false);
          // Every removed field should appear in missingFields
          for (const field of removedFields) {
            expect(result.missingFields).toContain(field);
          }
          // No kept field should appear in missingFields
          for (const field of keptFields) {
            expect(result.missingFields).not.toContain(field);
          }
          // No sections should be missing (we included all)
          expect(result.missingSections).toEqual([]);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should return valid: false with correct missingSections when sections are removed from HTML', () => {
    fc.assert(
      fc.property(
        metadataSectionsArb.filter((entries) => entries.length > 1),
        (sectionEntries) => {
          const metadata = buildMetadata(sectionEntries);

          const allSections = sectionEntries.map((s) => s.sectionName);
          const allFields = sectionEntries.flatMap((s) => s.fields);

          // Remove at least 1 section
          const removeCount = Math.max(1, Math.floor(allSections.length / 2));
          const removedSections = allSections.slice(0, removeCount);
          const keptSections = allSections.slice(removeCount);

          // Generate HTML with only kept sections but all fields
          const html = generateHtml(keptSections, allFields);

          const result = validateStructure(html, metadata);

          expect(result.valid).toBe(false);
          // Every removed section should appear in missingSections
          for (const section of removedSections) {
            expect(result.missingSections).toContain(section);
          }
          // No kept section should appear in missingSections
          for (const section of keptSections) {
            expect(result.missingSections).not.toContain(section);
          }
          // All fields are present so missingFields should be empty
          expect(result.missingFields).toEqual([]);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should return valid: false when both fields and sections are removed from HTML', () => {
    fc.assert(
      fc.property(
        metadataSectionsArb.filter(
          (entries) =>
            entries.length > 1 &&
            entries.flatMap((s) => s.fields).length > 0,
        ),
        (sectionEntries) => {
          const metadata = buildMetadata(sectionEntries);

          const allSections = sectionEntries.map((s) => s.sectionName);
          const allFields = sectionEntries.flatMap((s) => s.fields);

          // Remove subset of both
          const sectionRemoveCount = Math.max(1, Math.floor(allSections.length / 2));
          const fieldRemoveCount = Math.max(1, Math.floor(allFields.length / 2));

          const removedSections = allSections.slice(0, sectionRemoveCount);
          const keptSections = allSections.slice(sectionRemoveCount);
          const removedFields = allFields.slice(0, fieldRemoveCount);
          const keptFields = allFields.slice(fieldRemoveCount);

          const html = generateHtml(keptSections, keptFields);

          const result = validateStructure(html, metadata);

          expect(result.valid).toBe(false);
          expect(result.missingFields.length).toBeGreaterThan(0);
          expect(result.missingSections.length).toBeGreaterThan(0);

          for (const section of removedSections) {
            expect(result.missingSections).toContain(section);
          }
          for (const field of removedFields) {
            expect(result.missingFields).toContain(field);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should return valid: true when extra cosmetic elements are present (extra elements do not cause failure)', () => {
    fc.assert(
      fc.property(
        metadataSectionsArb,
        extraElementsArb,
        (sectionEntries, extraElements) => {
          const metadata = buildMetadata(sectionEntries);

          const allSections = sectionEntries.map((s) => s.sectionName);
          const allFields = sectionEntries.flatMap((s) => s.fields);

          // Generate HTML with all required fields/sections PLUS extra cosmetic elements
          const html = generateHtml(allSections, allFields, extraElements);

          const result = validateStructure(html, metadata);

          expect(result.valid).toBe(true);
          expect(result.missingFields).toEqual([]);
          expect(result.missingSections).toEqual([]);
        },
      ),
      { numRuns: 100 },
    );
  });
});
