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
import { forms } from './forms.js';
import { users } from './users.js';

export const calculationRuleTemplates = pgTable(
  'calculation_rule_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    formType: varchar('form_type', { length: 50 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    isActive: boolean('is_active').notNull().default(true),
    calculations: jsonb('calculations').notNull(),
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

export const calculationRuleOverrides = pgTable('calculation_rule_overrides', {
  id: uuid('id').primaryKey().defaultRandom(),
  formId: uuid('form_id')
    .notNull()
    .references(() => forms.id, { onDelete: 'cascade' }),
  ruleTemplateId: uuid('rule_template_id'),
  overrideType: varchar('override_type', { length: 20 }).notNull(),
  customRule: jsonb('custom_rule'),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  updatedBy: uuid('updated_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
