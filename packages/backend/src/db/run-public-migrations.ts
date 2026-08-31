/**
 * Runner de migraciones para el schema `public` (tablas de plataforma).
 *
 * A diferencia de MigrationRunner (que aplica migraciones a cada schema sgr_*),
 * este aplica en orden los .sql de public que la lógica de negocio necesita y
 * que NO forman parte del template por-tenant.
 *
 * - Idempotente: registra cada migración aplicada en public.schema_migrations
 *   con schema_name = 'public'.
 * - Se ejecuta automáticamente desde entrypoint.sh al arrancar el backend,
 *   evitando pasos manuales.
 *
 * Uso: tsx src/db/run-public-migrations.ts
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { getSqlClient } from './index.js';

const PUBLIC_SCHEMA = 'public';

/**
 * Lista ORDENADA de migraciones que aplican al schema public.
 * Solo se listan aquí las migraciones de plataforma (no las de tenants sgr_*).
 * Añadir nuevas al final para preservar el orden de aplicación.
 */
const PUBLIC_MIGRATIONS = [
  '0014_tenant_onboarding_status.sql',
  '0015_tenant_cancelled_status.sql',
];

async function ensureTrackingTable(): Promise<void> {
  const sql = getSqlClient();
  await sql`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      schema_name VARCHAR(100) NOT NULL,
      migration_name VARCHAR(255) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(schema_name, migration_name)
    )
  `;
}

async function isApplied(migrationName: string): Promise<boolean> {
  const sql = getSqlClient();
  const rows = await sql`
    SELECT id FROM public.schema_migrations
    WHERE schema_name = ${PUBLIC_SCHEMA} AND migration_name = ${migrationName}
    LIMIT 1
  `;
  return rows.length > 0;
}

async function apply(migrationName: string): Promise<void> {
  const sql = getSqlClient();
  const path = new URL(`./migrations/${migrationName}`, import.meta.url);
  const migrationSql = readFileSync(path, 'utf-8');

  await sql.begin(async (tx) => {
    await tx.unsafe(`SET search_path TO ${PUBLIC_SCHEMA}`);
    await tx.unsafe(migrationSql);
    await tx`
      INSERT INTO public.schema_migrations (schema_name, migration_name)
      VALUES (${PUBLIC_SCHEMA}, ${basename(migrationName)})
    `;
  });
}

async function main(): Promise<void> {
  await ensureTrackingTable();

  for (const migrationName of PUBLIC_MIGRATIONS) {
    if (await isApplied(migrationName)) {
      console.log(`  ⏭️  ${migrationName} (ya aplicada)`);
      continue;
    }
    try {
      await apply(migrationName);
      console.log(`  ✅ ${migrationName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  ❌ ${migrationName}: ${message}`);
      process.exit(1);
    }
  }

  console.log('✅ Migraciones de public aplicadas.');
  process.exit(0);
}

main().catch((error) => {
  console.error('Error fatal aplicando migraciones de public:', error);
  process.exit(1);
});
