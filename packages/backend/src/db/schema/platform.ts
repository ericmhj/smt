import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  jsonb,
} from 'drizzle-orm/pg-core';

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  // FK lógica hacia license-service (fuente de verdad): guarda el tenant.id
  // (UUID) del license-service. Es la clave de correlación cross-service.
  // Para tenants nuevos se rellena desde event.tenant_id; para existentes,
  // via backfill por slug (aditivo, sin tocar el id local).
  licenseTenantId: uuid('license_tenant_id').unique(),
  hashId: varchar('hash_id', { length: 4 }).notNull().unique(),
  slug: varchar('slug', { length: 50 }).notNull().unique(),
  nombre: varchar('nombre', { length: 255 }).notNull(),
  plan: varchar('plan', { length: 50 }).notNull().default('starter'),
  // onboarding = creado en license-service pero aún no activado.
  status: varchar('status', { length: 20 }).notNull().default('onboarding'),
  config: jsonb('config').default({}),
  scheduledDeletionAt: timestamp('scheduled_deletion_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
