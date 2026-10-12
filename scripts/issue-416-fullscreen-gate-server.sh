#!/usr/bin/env bash
# Issue #416 — local prod build against a disposable file store (never production).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

RUN_ID="${OEE360_VERIFY_RUN_ID:-$(date +%s)}"
export SPARES_DATA_DIR="${SPARES_DATA_DIR:-/tmp/oee360-issue-416-$RUN_ID}"
export PORT="${ISSUE_416_PORT:-3016}"

if [[ -n "${SPARES_DATA_DIR_PROD:-}" ]] || [[ "$SPARES_DATA_DIR" == *"oee360.com"* ]]; then
  echo "Refusing to start: SPARES_DATA_DIR looks like production." >&2
  exit 1
fi

mkdir -p "$SPARES_DATA_DIR"
echo "issue-416 gate server"
echo "  SPARES_DATA_DIR=$SPARES_DATA_DIR"
echo "  PORT=$PORT"
echo "  build: npm run build"
echo "  start: npm run start -- -p $PORT"

npm run build
exec env SPARES_DATA_DIR="$SPARES_DATA_DIR" npm run start -- -p "$PORT"
