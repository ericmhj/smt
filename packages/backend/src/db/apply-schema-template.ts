import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEMPLATE_PATH = join(__dirname, 'schema-template.sql');

/**
 * Reads the schema template SQL and executes it within the specified schema.
 * This function must be called within an existing transaction/connection
 * that has already created the schema.
 */
export async function applySchemaTemplate(
  sql: { unsafe: (query: string) => Promise<unknown> },
  schemaName: string,
): Promise<void> {
  // Validate schema name to prevent SQL injection
  if (!/^sgr_[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(schemaName)) {
    throw new Error(`Invalid schema name: ${schemaName}`);
  }

  const templateSql = readFileSync(TEMPLATE_PATH, 'utf-8');

  // Set search_path to the target schema so all tables are created there
  await sql.unsafe(`SET search_path TO ${schemaName}, public`);

  // Execute the template SQL
  await sql.unsafe(templateSql);

  // Reset search_path
  await sql.unsafe(`SET search_path TO public`);
}
