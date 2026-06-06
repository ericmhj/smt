import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  jsonb,
  integer,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const clientes = pgTable(
  'clientes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nombre: varchar('nombre', { length: 255 }).notNull(),
    empresa: varchar('empresa', { length: 255 }),
    email: varchar('email', { length: 255 }).notNull().unique(),
    telefono: varchar('telefono', { length: 30 }).unique(),
    direccion: varchar('direccion', { length: 500 }),
    industria: varchar('industria', { length: 100 }),
    etiquetas: jsonb('etiquetas').$type<string[]>().notNull().default([]),
    asignadoA: uuid('asignado_a').references(() => users.id),
    activo: boolean('activo').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_clientes_empresa').on(table.empresa),
    index('idx_clientes_industria').on(table.industria),
    index('idx_clientes_asignado').on(table.asignadoA),
    index('idx_clientes_etiquetas').using('gin', table.etiquetas),
  ],
);

export const clienteContactos = pgTable('cliente_contactos', {
  id: uuid('id').primaryKey().defaultRandom(),
  clienteId: uuid('cliente_id')
    .notNull()
    .references(() => clientes.id, { onDelete: 'cascade' }),
  nombre: varchar('nombre', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }),
  telefono: varchar('telefono', { length: 30 }),
  cargo: varchar('cargo', { length: 100 }),
  esPrincipal: boolean('es_principal').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const clienteDocumentos = pgTable('cliente_documentos', {
  id: uuid('id').primaryKey().defaultRandom(),
  clienteId: uuid('cliente_id')
    .notNull()
    .references(() => clientes.id, { onDelete: 'cascade' }),
  originalName: varchar('original_name', { length: 255 }).notNull(),
  storageKey: varchar('storage_key', { length: 500 }).notNull(),
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  uploadedBy: uuid('uploaded_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
