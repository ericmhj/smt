#!/bin/bash
set -e

echo "=== SGR Frontend DevContainer Setup ==="

# 1. Install pnpm globally (if not already available via feature)
if ! command -v pnpm &> /dev/null; then
  echo "Installing pnpm..."
  npm install -g pnpm@9.12.0
fi

# 2. Install project dependencies
echo "Installing dependencies..."
cd /workspace
pnpm install

echo ""
echo "=== Setup Complete ==="
echo ""
echo "IMPORTANT: The backend devcontainer must be running first!"
echo ""
echo "To start the frontend:"
echo "  cd /workspace && pnpm dev --filter @sgr/frontend"
echo ""
echo "Frontend will be available at: http://localhost:3000"
echo "API requests will be proxied to: http://localhost:3001"
echo ""
echo "Port mapping:"
echo "  Frontend (Next.js):  http://localhost:3000"
echo "  Backend API:         http://localhost:3001"
echo "  API Docs (Swagger):  http://localhost:3001/api/docs"
echo "  MinIO Console:       http://localhost:9001"
echo ""
