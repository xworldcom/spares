#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
RUN_ID="${OEE360_VERIFY_RUN_ID:-round3b-$(date +%s)}"
DATA_DIR="/tmp/oee360-round3b-${RUN_ID}"
OUT="/cursor/stores/self/media/round3b"
PORT="${R3B_PORT:-3013}"
mkdir -p "$OUT" "$DATA_DIR/files"
export SPARES_DATA_DIR="$DATA_DIR"
export SPARES_ALLOW_SEED=false
export AUTH_SECRET="${AUTH_SECRET:-round3b-local-auth-secret-not-for-production}"
export SPARES_CORS_ORIGINS="${SPARES_CORS_ORIGINS:-http://localhost:${PORT}}"
export R3_BASE="http://127.0.0.1:${PORT}"
export R3_OUT="$OUT"
export R3_TAG="${R3_TAG:-after}"

npm run build
node "$ROOT/node_modules/next/dist/bin/next" start -p "$PORT" &
PID=$!
trap 'kill "$PID" 2>/dev/null || true' EXIT

for _ in $(seq 1 60); do
  if curl -sf "$R3_BASE/login" >/dev/null; then break; fi
  sleep 1
done

node "$ROOT/scripts/round3b/e2e-demo-migration-auto.cjs"
echo "Evidence in $OUT tag=$R3_TAG"
