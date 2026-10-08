#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export R4_BASE="${R4_BASE:-http://localhost:3014}"
export R4_TAG="${R4_TAG:-after}"
export R4_OUT="${R4_OUT:-/cursor/stores/self/media/round4c}"
mkdir -p "$R4_OUT"
node "$ROOT/scripts/round4c/e2e-isolate.cjs"
node "$ROOT/scripts/round4c/e2e-phone-landing.cjs"
