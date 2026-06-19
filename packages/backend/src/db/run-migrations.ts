/**
 * CLI script to run cross-schema migrations.
 * Usage: npx tsx src/db/run-migrations.ts <migration-file-path>
 *
 * Example:
 *   npx tsx src/db/run-migrations.ts src/db/migrations/0007_add_column.sql
 */
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { MigrationRunner } from './migration-runner.js';

async function main() {
  const migrationPath = process.argv[2];

  if (!migrationPath) {
    console.error('Usage: npx tsx src/db/run-migrations.ts <migration-file-path>');
    process.exit(1);
  }

  const resolvedPath = resolve(migrationPath);

  if (!existsSync(resolvedPath)) {
    console.error(`Migration file not found: ${resolvedPath}`);
    process.exit(1);
  }

  const runner = new MigrationRunner();

  // Ensure tracking table exists
  await runner.ensureTrackingTable();

  console.log(`Discovering tenant schemas...`);
  const schemas = await runner.discoverSchemas();
  console.log(`Found ${schemas.length} tenant schema(s): ${schemas.join(', ')}`);

  console.log(`\nApplying migration: ${migrationPath}`);
  const results = await runner.applyMigration(resolvedPath);

  let hasErrors = false;
  for (const result of results) {
    if (result.success) {
      console.log(`  ✅ ${result.schemaName}`);
    } else {
      console.error(`  ❌ ${result.schemaName}: ${result.error}`);
      hasErrors = true;
    }
  }

  if (hasErrors) {
    console.error('\n⚠️  Some schemas had errors. Check logs above.');
    process.exit(1);
  } else {
    console.log('\n✅ Migration applied successfully to all schemas.');
  }

  process.exit(0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
