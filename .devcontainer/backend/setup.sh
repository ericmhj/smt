#!/bin/bash
set -e

echo "=== SGR Backend DevContainer Setup ==="

# 1. Install pnpm globally (if not already available via feature)
if ! command -v pnpm &> /dev/null; then
  echo "Installing pnpm..."
  npm install -g pnpm@9.12.0
fi

# 2. Install project dependencies
echo "Installing dependencies..."
cd /workspace
pnpm install

# 3. Generate RSA keys for JWT (if not exist)
if [ ! -f /workspace/keys/private.pem ]; then
  echo "Generating RSA key pair for JWT..."
  mkdir -p /workspace/keys
  openssl genrsa -out /workspace/keys/private.pem 2048
  openssl rsa -in /workspace/keys/private.pem -pubout -out /workspace/keys/public.pem
  echo "JWT keys generated at /workspace/keys/"
fi

# 4. Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL..."
until pg_isready -h postgres -p 5432 -U sgr 2>/dev/null; do
  sleep 1
done
echo "PostgreSQL is ready."

# 5. Run database migrations
echo "Running database migrations..."
cd /workspace/packages/backend
pnpm db:migrate || echo "Migrations skipped (may need drizzle-kit generate first)"

# 6. Seed database with development data
echo "Seeding database..."
pnpm db:seed || echo "Seed skipped (may already exist)"

# 7. Create MinIO bucket if not exists
echo "Configuring MinIO bucket..."
# Wait for MinIO
sleep 3
# Use mc (MinIO Client) if available, otherwise skip
if command -v mc &> /dev/null; then
  mc alias set sgr-minio http://minio:9000 sgr_minio_dev sgr_minio_dev_password 2>/dev/null || true
  mc mb sgr-minio/sgr-files 2>/dev/null || true
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Services available:"
echo "  PostgreSQL: postgres:5432 (user: sgr, db: sgr_dev)"
echo "  Redis:      redis:6379"
echo "  MinIO:      minio:9000 (console: http://localhost:9001)"
echo "  ClamAV:     clamav:3310"
echo ""
echo "To start the backend:"
echo "  cd /workspace && pnpm dev --filter @sgr/backend"
echo ""
echo "Backend will be available at: http://localhost:3001"
echo "API docs at: http://localhost:3001/api/docs"
echo ""
