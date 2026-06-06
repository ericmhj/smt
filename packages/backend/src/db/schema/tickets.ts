import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  integer,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { clientes } from './clientes.js';
import { forms } from './forms.js';
import { reactivos } from './reactivos.js';

export const tickets = pgTable(
  'tickets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clienteId: uuid('cliente_id')
      .notNull()
      .references(() => clientes.id),
    formId: uuid('form_id')
      .notNull()
      .references(() => forms.id),
    tecnicoAsignadoId: uuid('tecnico_asignado_id').references(() => users.id),
    reactivoId: uuid('reactivo_id').references(() => reactivos.id),
    prioridad: varchar('prioridad', { length: 10 }).notNull().default('media'),
    slaHoras: integer('sla_horas').notNull(),
    estado: varchar('estado', { length: 20 }).notNull().default('abierto'),
    fechaLimite: timestamp('fecha_limite', { withTimezone: true }).notNull(),
    creadoPor: uuid('creado_por')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_tickets_cliente').on(table.clienteId),
    index('idx_tickets_tecnico').on(table.tecnicoAsignadoId),
    index('idx_tickets_estado').on(table.estado),
    index('idx_tickets_prioridad').on(table.prioridad),
    index('idx_tickets_fecha_limite').on(table.fechaLimite),
  ],
);

export const slaConfig = pgTable('sla_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  prioridad: varchar('prioridad', { length: 10 }).notNull().unique(),
  horasLimite: integer('horas_limite').notNull(),
  activo: boolean('activo').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const reglasAsignacion = pgTable('reglas_asignacion', {
  id: uuid('id').primaryKey().defaultRandom(),
  nombre: varchar('nombre', { length: 255 }).notNull(),
  tipo: varchar('tipo', { length: 20 }).notNull(),
  condiciones: jsonb('condiciones').notNull(),
  activo: boolean('activo').notNull().default(true),
  creadoPor: uuid('creado_por')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
