/**
 * Report Templates Engine - Database Schema (Drizzle ORM)
 *
 * Report template definitions stored in public schema.
 * Can be global (by form_type) or specific to a tenant's form (by tenant_form_id).
 *
 * @module report-templates schema
 * @requirements 1.1, 1.2
 */

import {
  pgTable,
  uuid,
  varchar,
  boolean,
  text,
  jsonb,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';

/**
 * Report templates that define PDF structure.
 * - Global templates: form_type set, tenant_slug/tenant_form_id null
 * - Tenant-specific templates: tenant_slug + tenant_form_id set (linked to a specific form)
 */
export const reportTemplates = pgTable(
  'report_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    formType: varchar('form_type', { length: 50 }),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    isActive: boolean('is_active').notNull().default(true),
    sections: jsonb('sections').notNull(),
    tenantSlug: varchar('tenant_slug', { length: 50 }),
    tenantFormId: uuid('tenant_form_id'),
    parentTemplateId: uuid('parent_template_id'),
    createdBy: uuid('created_by'),
    updatedBy: uuid('updated_by'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [unique().on(table.formType, table.name)],
);
