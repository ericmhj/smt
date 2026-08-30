import {
  pgTable,
  uuid,
  varchar,
  integer,
  decimal,
  timestamp,
  jsonb,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { tenants } from './platform.js';

/**
 * Cuenta de consumo por tenant — saldo espejo del license-service.
 * Se actualiza EXCLUSIVAMENTE via eventos Kafka del license-service.
 * Ningún endpoint de SMT puede modificar el saldo directamente.
 */
export const tenantConsumptionAccounts = pgTable('tenant_consumption_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .unique()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  saldoCreditos: decimal('saldo_creditos', { precision: 10, scale: 2 })
    .notNull()
    .default('0'),
  creditosTotalesAdquiridos: integer('creditos_totales_adquiridos').notNull().default(0),
  ultimoEventoId: varchar('ultimo_evento_id', { length: 100 }),
  ultimoSync: timestamp('ultimo_sync', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Libro mayor de movimientos — append-only.
 * Cada entrada corresponde a un evento del license-service.
 * El campo evento_externo_id garantiza idempotencia (UNIQUE).
 */
export const consumptionLedger = pgTable(
  'consumption_ledger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    eventoExternoId: varchar('evento_externo_id', { length: 100 }).notNull().unique(),
    tipo: varchar('tipo', { length: 20 }).notNull(), // consumo, recarga, bonus, ajuste, compensacion, excedente
    cantidad: decimal('cantidad', { precision: 10, scale: 2 }).notNull(),
    saldoResultante: decimal('saldo_resultante', { precision: 10, scale: 2 }).notNull(),
    concepto: varchar('concepto', { length: 255 }).notNull(),
    perfilDocumento: varchar('perfil_documento', { length: 50 }),
    referencia: varchar('referencia', { length: 255 }),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_ledger_tenant').on(table.tenantId, table.createdAt),
    index('idx_ledger_evento').on(table.eventoExternoId),
  ],
);
