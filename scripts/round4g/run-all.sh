#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
OUT="${R4_OUT:-/cursor/stores/self/media/round4g}"
PORT="${R4G_PORT:-3014}"
DATA_DIR="/tmp/oee360-round4g-${PORT}"
mkdir -p "$OUT" "$DATA_DIR/files"
export SPARES_DATA_DIR="$DATA_DIR"
export SPARES_ALLOW_SEED=false
export AUTH_SECRET="${AUTH_SECRET:-round4g-local-auth-secret-not-for-production}"
export SPARES_CORS_ORIGINS="${SPARES_CORS_ORIGINS:-http://127.0.0.1:${PORT}}"
export R4_BASE="http://127.0.0.1:${PORT}"
export R4_OUT="$OUT"
export R4_TAG="${R4_TAG:-after}"

npm run build
node "$ROOT/node_modules/next/dist/bin/next" start -p "$PORT" &
PID=$!
trap 'kill "$PID" 2>/dev/null || true' EXIT

for _ in $(seq 1 90); do
  if curl -sf "$R4_BASE/login" >/dev/null; then break; fi
  sleep 1
done

node "$ROOT/scripts/round4g/e2e-phone-landing-beats.cjs"
node "$ROOT/scripts/round4g/e2e-desktop-pagedown.cjs"
node --experimental-strip-types --test "$ROOT/src/lib/ui/landing-demo.test.ts"
node --experimental-strip-types --test "$ROOT/src/lib/ui/quote-progress-mobile.test.ts"
echo "Round 4g evidence in $OUT"
