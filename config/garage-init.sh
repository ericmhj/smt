#!/bin/sh
set -e

echo "=== Garage Init ==="
sleep 10

ADMIN="http://garage:3903"
TOKEN="sgr-garage-admin-token"

# Wait for Garage
until wget -qO /dev/null "$ADMIN/health" 2>/dev/null; do
  echo "Waiting for Garage..."
  sleep 3
done
echo "Garage is up!"

# Get node ID
RAW=$(wget -qO- --header="Authorization: Bearer $TOKEN" "$ADMIN/v1/status" 2>/dev/null || true)
NODE_ID=$(echo "$RAW" | sed -n 's/.*"node" *: *"\([0-9a-f]\{64\}\)".*/\1/p' | head -1)
if [ -z "$NODE_ID" ]; then
  NODE_ID=$(echo "$RAW" | tr ',' '\n' | tr '{' '\n' | grep '"id"' | head -1 | sed 's/.*"\([0-9a-f]\{64\}\)".*/\1/')
fi
echo "Node ID: $NODE_ID"

if [ -z "$NODE_ID" ]; then
  echo "ERROR: Cannot get node ID"
  exit 1
fi

# Assign layout (array format)
echo "=== Assign layout ==="
wget -qO- --header="Authorization: Bearer $TOKEN" --header="Content-Type: application/json" \
  --post-data="[{\"id\":\"$NODE_ID\",\"zone\":\"dc1\",\"capacity\":1073741824,\"tags\":[]}]" \
  "$ADMIN/v1/layout" 2>&1 || echo "(done or already assigned)"

# Apply layout
echo "=== Apply layout ==="
wget -qO- --header="Authorization: Bearer $TOKEN" --header="Content-Type: application/json" \
  --post-data='{"version":1}' \
  "$ADMIN/v1/layout/apply" 2>&1 || echo "(done or already applied)"

sleep 3

# Create bucket
echo "=== Create bucket ==="
wget -qO- --header="Authorization: Bearer $TOKEN" --header="Content-Type: application/json" \
  --post-data='{"globalAlias":"sgr-files"}' \
  "$ADMIN/v1/bucket" 2>&1 || echo "(already exists)"

# Create key
echo "=== Create key ==="
wget -qO- --header="Authorization: Bearer $TOKEN" --header="Content-Type: application/json" \
  --post-data='{"name":"sgr-app-key"}' \
  "$ADMIN/v1/key" 2>&1 || echo "(already exists)"

echo "=== Garage Init Complete ==="
