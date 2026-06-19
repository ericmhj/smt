import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { getSqlClient } from './index.js';

export interface MigrationResult {
  schemaName: string;
  success: boolean;
  error?: string;
}

/**
 * Cross-schema migration runner.
 * Discovers all tenant schemas (sgr_*) and applies a migration to each one.
 * Records applied migrations in public.schema_migrations to prevent duplicates.
 */
export class MigrationRunner {
  /**
   * Discovers all tenant schemas in the database.
   */
  async discoverSchemas(): Promise<string[]> {
    const sql = getSqlClient();
    const result = await sql`
      SELECT nspname FROM pg_namespace
      WHERE nspname LIKE 'sgr_%'
      ORDER BY nspname
    `;
    return result.map((row: { nspname: string }) => row.nspname);
  }

  /**
   * Checks if a migration has already been applied to a schema.
   */
  private async isMigrationApplied(
    schemaName: string,
    migrationName: string,
  ): Promise<boolean> {
    const sql = getSqlClient();
    const result = await sql`
      SELECT id FROM public.schema_migrations
      WHERE schema_name = ${schemaName} AND migration_name = ${migrationName}
      LIMIT 1
    `;
    return result.length > 0;
  }

  /**
   * Applies a migration SQL file to all tenant schemas.
   * Each schema gets its own transaction; failures are logged and skipped.
   */
  async applyMigration(migrationPath: string): Promise<MigrationResult[]> {
    const sql = getSqlClient();
    const migrationName = basename(migrationPath);
    const migrationSql = readFileSync(migrationPath, 'utf-8');

    const schemas = await this.discoverSchemas();
    const results: MigrationResult[] = [];

    for (const schemaName of schemas) {
      try {
        // Check if already applied
        const applied = await this.isMigrationApplied(schemaName, migrationName);
        if (applied) {
          results.push({ schemaName, success: true });
          continue;
        }

        // Apply within a transaction
        await sql.begin(async (tx) => {
          // Set search_path to the target schema
          await tx.unsafe(`SET search_path TO ${schemaName}, public`);

          // Execute the migration
          await tx.unsafe(migrationSql);

          // Record the migration
          await tx`
            INSERT INTO public.schema_migrations (schema_name, migration_name)
            VALUES (${schemaName}, ${migrationName})
          `;

          // Reset search_path
          await tx.unsafe(`SET search_path TO public`);
        });

        results.push({ schemaName, success: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Migration '${migrationName}' failed for schema '${schemaName}': ${message}`);
        results.push({ schemaName, success: false, error: message });
      }
    }

    return results;
  }

  /**
   * Ensures the schema_migrations tracking table exists.
   */
  async ensureTrackingTable(): Promise<void> {
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
}
