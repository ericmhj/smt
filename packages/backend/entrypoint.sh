#!/bin/sh
set -e

echo "=== SGR Backend Starting ==="

# Wait for PostgreSQL to be ready (simple TCP check)
echo "Waiting for PostgreSQL..."
while ! nc -z postgres 5432 2>/dev/null; do
  sleep 1
done
echo "PostgreSQL is ready."

# Wait for Redis
echo "Waiting for Redis..."
while ! nc -z redis 6379 2>/dev/null; do
  sleep 1
done
echo "Redis is ready."

# Run seed (idempotent)
echo "Running database seed..."
cd /app
pnpm --filter @sgr/backend db:seed 2>&1 || echo "Seed skipped (may already be applied or has errors)."

# Start the server
echo "Starting backend server on port 3001..."
exec pnpm --filter @sgr/backend start
