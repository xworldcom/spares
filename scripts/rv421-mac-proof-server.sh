#!/usr/bin/env bash
set -euo pipefail
RUN_ID="${RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
PORT="${RV421_GATE_PORT:-3019}"
export SPARES_DATA_DIR="${SPARES_DATA_DIR:-${RV421_PROOF_DATA_DIR:-/tmp/oee360-rv421-proof-$RUN_ID}}"
export SPARES_ALLOW_SEED="${SPARES_ALLOW_SEED:-false}"
export SPARES_PUBLIC_ORIGIN="${SPARES_PUBLIC_ORIGIN:-http://127.0.0.1:$PORT}"

if [[ -n "${SPARES_DATA_DIR_PROD:-}" ]] || [[ "$SPARES_DATA_DIR" == *"oee360.com"* ]]; then
  echo "Refusing to start: SPARES_DATA_DIR looks like production." >&2
  exit 1
fi

mkdir -p "$SPARES_DATA_DIR"

echo "rv421 proof server:"
echo "  SPARES_DATA_DIR=$SPARES_DATA_DIR"
echo "  PORT=$PORT"
echo "  (run: node scripts/rv421-mac-proof-seed.mjs first if empty)"

exec env SPARES_DATA_DIR="$SPARES_DATA_DIR" SPARES_ALLOW_SEED="$SPARES_ALLOW_SEED" \
  SPARES_PUBLIC_ORIGIN="$SPARES_PUBLIC_ORIGIN" \
  npm run start -- -p "$PORT"
