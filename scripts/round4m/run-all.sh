#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
OUT="${R4_OUT:-/cursor/stores/self/media/round4m}"
PORT="${R4M_PORT:-3020}"
DATA_DIR="/tmp/oee360-round4m-${PORT}"
mkdir -p "$OUT" "$DATA_DIR/files"
export SPARES_DATA_DIR="$DATA_DIR"
export SPARES_ALLOW_SEED=false
export AUTH_SECRET="${AUTH_SECRET:-round4m-local-auth-secret-not-for-production}"
export SPARES_CORS_ORIGINS="${SPARES_CORS_ORIGINS:-http://127.0.0.1:${PORT}}"
export R4_BASE="http://127.0.0.1:${PORT}"
export R4_OUT="$OUT"
export R4_TAG="${R4_TAG:-after}"
export CHROME_BIN="${CHROME_BIN:-/usr/local/bin/google-chrome}"
export R4_NO_VIDEO=1

npm run build
node "$ROOT/node_modules/next/dist/bin/next" start -p "$PORT" &
PID=$!
trap 'kill "$PID" 2>/dev/null || true' EXIT

for _ in $(seq 1 90); do
  if curl -sf "$R4_BASE/login" >/dev/null; then break; fi
  sleep 1
done

API_CODE="$(curl -s -o /dev/null -w "%{http_code}" "$R4_BASE/api/auth/sign-in-options" || echo 000)"
if [ "$API_CODE" = "409" ] || [ "$API_CODE" = "500" ]; then
  echo "FAIL API regression sign-in-options HTTP $API_CODE"
  exit 1
fi
node "$ROOT/scripts/round4m/e2e-desktop-pagedown.cjs"
node "$ROOT/scripts/round4m/e2e-desktop-wheel-notches.cjs"
node "$ROOT/scripts/round4m/e2e-phone-idle-scroll.cjs"
node "$ROOT/scripts/round4m/e2e-phone-landing-gestures.cjs"
node "$ROOT/scripts/round4m/e2e-phone-390-direction.cjs"
node --experimental-strip-types --test "$ROOT/src/lib/ui/landing-demo.test.ts"
echo "Round 4m evidence in $OUT"
