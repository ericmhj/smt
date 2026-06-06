import {
  pgTable,
  uuid,
  integer,
  varchar,
  jsonb,
  timestamp,
} from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { forms, formVersions } from './forms.js';
import { signatures } from './signatures.js';

export const reactivos = pgTable('reactivos', {
  id: uuid('id').primaryKey().defaultRandom(),
  formId: uuid('form_id')
    .notNull()
    .references(() => forms.id),
  formVersionId: uuid('form_version_id')
    .notNull()
    .references(() => formVersions.id),
  tecnicoId: uuid('tecnico_id')
    .notNull()
    .references(() => users.id),
  parentReactivoId: uuid('parent_reactivo_id').references(
    (): any => reactivos.id,
  ),
  attemptNumber: integer('attempt_number').notNull().default(1),
  state: varchar('state', { length: 50 }).notNull().default('pendiente'),
  responses: jsonb('responses').notNull(),
  rejectionReason: varchar('rejection_reason', { length: 1000 }),
  fechaProgramada: timestamp('fecha_programada', { withTimezone: true }),
  clienteNombre: varchar('cliente_nombre', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const stateTransitions = pgTable('state_transitions', {
  id: uuid('id').primaryKey().defaultRandom(),
  reactivoId: uuid('reactivo_id')
    .notNull()
    .references(() => reactivos.id),
  fromState: varchar('from_state', { length: 50 }).notNull(),
  toState: varchar('to_state', { length: 50 }).notNull(),
  actorId: uuid('actor_id')
    .notNull()
    .references(() => users.id),
  signatureId: uuid('signature_id')
    .notNull()
    .references(() => signatures.id),
  reason: varchar('reason', { length: 1000 }),
  ipAddress: varchar('ip_address', { length: 45 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
