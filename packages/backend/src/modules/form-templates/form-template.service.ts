/**
 * Form Template Service
 *
 * Handles CRUD operations for platform-level form templates (Formularios Padre).
 * Extracts fields_metadata from HTML content using JSDOM to identify sections
 * and field names.
 *
 * @module form-template.service
 * @requirements 16.1, 16.2, 16.3, 16.4, 16.5, 16.6
 */

import { eq } from 'drizzle-orm';
import { JSDOM } from 'jsdom';
import type { Database } from '../../db/index.js';
import { formTemplates } from '../../db/schema/validation.js';
import type { CreateFormTemplateInput, UpdateFormTemplateInput } from './form-template.schemas.js';

/**
 * Structure of the fields_metadata JSONB column.
 */
export interface FieldsMetadata {
  sections: Array<{
    sectionName: string;
    fields: string[];
  }>;
}

export class FormTemplateService {
  constructor(private db: Database) {}

  /**
   * List all form templates (active and inactive) for admin management.
   */
  async listAll() {
    const results = await this.db
      .select()
      .from(formTemplates);
    return results;
  }

  /**
   * List all active form templates (for tenant catalog).
   */
  async list() {
    const results = await this.db
      .select()
      .from(formTemplates)
      .where(eq(formTemplates.isActive, true));
    return results;
  }

  /**
   * Get a form template by ID.
   */
  async getById(id: string) {
    const results = await this.db
      .select()
      .from(formTemplates)
      .where(eq(formTemplates.id, id));
    return results[0] ?? null;
  }

  /**
   * Create a new form template.
   * Extracts fields_metadata from the provided HTML content.
   */
  async create(data: CreateFormTemplateInput, actorId?: string) {
    const fieldsMetadata = FormTemplateService.extractFieldsMetadata(data.html_content);

    const [result] = await this.db
      .insert(formTemplates)
      .values({
        formType: data.form_type,
        name: data.name,
        description: data.description ?? null,
        htmlContent: data.html_content,
        fieldsMetadata,
        currentVersion: 1,
        isActive: true,
        createdBy: actorId ?? null,
      })
      .returning();

    return result;
  }

  /**
   * Update an existing form template.
   * Increments current_version. Re-extracts fields_metadata if html_content changed.
   */
  async update(id: string, data: UpdateFormTemplateInput, actorId?: string) {
    const existing = await this.getById(id);
    if (!existing) {
      return null;
    }

    const updateValues: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (data.name !== undefined) {
      updateValues.name = data.name;
    }

    if (data.description !== undefined) {
      updateValues.description = data.description;
    }

    if (data.html_content !== undefined) {
      updateValues.htmlContent = data.html_content;
      updateValues.fieldsMetadata = FormTemplateService.extractFieldsMetadata(data.html_content);
    }

    // Always increment version on update
    updateValues.currentVersion = existing.currentVersion + 1;

    const [result] = await this.db
      .update(formTemplates)
      .set(updateValues)
      .where(eq(formTemplates.id, id))
      .returning();

    return result;
  }

  /**
   * Toggle the is_active status of a form template.
   */
  async toggle(id: string) {
    const existing = await this.getById(id);
    if (!existing) {
      return null;
    }

    const [result] = await this.db
      .update(formTemplates)
      .set({
        isActive: !existing.isActive,
        updatedAt: new Date(),
      })
      .where(eq(formTemplates.id, id))
      .returning();

    return result;
  }

  /**
   * Delete a form template by ID.
   */
  async delete(id: string) {
    await this.db
      .delete(formTemplates)
      .where(eq(formTemplates.id, id));
  }

  /**
   * Extract fields_metadata from HTML content.
   *
   * Parses the HTML to find:
   * - Sections: identified by elements with class "section-heading" (text content)
   *   or elements with `data-section` attribute
   * - Fields: identified by elements with a `name` attribute
   *
   * Fields are grouped into the most recent section found before them in document order.
   * Fields appearing before any section are grouped under a default section.
   */
  static extractFieldsMetadata(html: string): FieldsMetadata {
    const dom = new JSDOM(html);
    const document = dom.window.document;

    const sections: Array<{ sectionName: string; fields: string[] }> = [];
    let currentSection: { sectionName: string; fields: string[] } | null = null;

    // Walk through all elements in document order to build sections with their fields
    const allElements = document.querySelectorAll('*');
    const seenFieldNames = new Set<string>();

    for (const el of allElements) {
      // Check if this element is a section heading
      const isSectionHeading = el.classList.contains('section-heading');
      const dataSectionValue = el.getAttribute('data-section');

      if (isSectionHeading || dataSectionValue) {
        const sectionName = dataSectionValue || el.textContent?.trim() || '';
        if (sectionName) {
          currentSection = { sectionName, fields: [] };
          sections.push(currentSection);
        }
        continue;
      }

      // Check if this element has a name attribute (it's a form field)
      const name = el.getAttribute('name');
      if (name && !seenFieldNames.has(name)) {
        seenFieldNames.add(name);
        if (!currentSection) {
          // Skip fields that appear before any section heading
          // (e.g., viewport meta tags, hidden fields in the header)
          continue;
        }
        currentSection.fields.push(name);
      }
    }

    return { sections };
  }
}
