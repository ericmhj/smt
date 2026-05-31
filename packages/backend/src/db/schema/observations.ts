import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { reactivos } from './reactivos.js';

export const observations = pgTable('observations', {
  id: uuid('id').primaryKey().defaultRandom(),
  reactivoId: uuid('reactivo_id')
    .notNull()
    .references(() => reactivos.id),
  authorId: uuid('author_id')
    .notNull()
    .references(() => users.id),
  content: text('content').notNull(),
  isRead: boolean('is_read').notNull().default(false),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const observationFiles = pgTable('observation_files', {
  id: uuid('id').primaryKey().defaultRandom(),
  observationId: uuid('observation_id')
    .notNull()
    .references(() => observations.id),
  originalName: varchar('original_name', { length: 255 }).notNull(),
  storageKey: varchar('storage_key', { length: 512 }).notNull(),
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  scanStatus: varchar('scan_status', { length: 50 }).notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
