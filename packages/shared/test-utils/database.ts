import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';

let container: StartedPostgreSqlContainer | null = null;

/**
 * Creates a PostgreSQL test database using Testcontainers.
 * Returns the connection URI for the test database.
 */
export async function createTestDatabase(): Promise<{
  connectionUri: string;
  container: StartedPostgreSqlContainer;
}> {
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('sgr_test')
    .withUsername('test')
    .withPassword('test')
    .start();

  return {
    connectionUri: container.getConnectionUri(),
    container,
  };
}

/**
 * Stops and removes the test database container.
 */
export async function cleanupTestDatabase(): Promise<void> {
  if (container) {
    await container.stop();
    container = null;
  }
}
