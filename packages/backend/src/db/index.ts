import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const client = postgres(connectionString, {
  // Single connection ensures SET search_path persists for the entire request lifecycle.
  // Fastify serializes request processing on this connection.
  max: 1,
});

export const db = drizzle(client, { schema });

export type Database = typeof db;

export { schema };

/**
 * Returns the underlying postgres.js SQL client for raw queries.
 * Used by the tenant middleware to execute SET search_path commands.
 */
export function getSqlClient() {
  return client;
}
