import {
  pgTable,
  uuid,
  varchar,
  boolean,
  integer,
  text,
  jsonb,
  timestamp,
} from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const forms = pgTable('forms', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  isActive: boolean('is_active').notNull().default(true),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  parentFormId: uuid('parent_form_id'),
  currentVersion: integer('current_version').notNull().default(1),
  templateId: uuid('template_id'),
  formType: varchar('form_type', { length: 50 }).default('legacy'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const formVersions = pgTable('form_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  formId: uuid('form_id')
    .notNull()
    .references(() => forms.id),
  versionNumber: integer('version_number').notNull(),
  htmlContent: text('html_content').notNull(),
  sanitizedHtml: text('sanitized_html').notNull(),
  jsonSchema: jsonb('json_schema').notNull(),
  fieldsMetadata: jsonb('fields_metadata').notNull(),
  changeType: varchar('change_type', { length: 50 }).notNull(),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const formAssignments = pgTable('form_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  formId: uuid('form_id')
    .notNull()
    .references(() => forms.id),
  tecnicoId: uuid('tecnico_id')
    .notNull()
    .references(() => users.id),
  assignedBy: uuid('assigned_by')
    .notNull()
    .references(() => users.id),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});
