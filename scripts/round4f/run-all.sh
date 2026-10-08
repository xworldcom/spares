#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export R4_BASE="${R4_BASE:-http://localhost:3014}"
export R4_TAG="${R4_TAG:-after}"
export R4_OUT="${R4_OUT:-/cursor/stores/self/media/round4f}"
mkdir -p "$R4_OUT"
node "$ROOT/scripts/round4f/e2e-landing-scroll-reach.cjs"
node "$ROOT/scripts/round4f/e2e-sign-in-header.cjs"
node "$ROOT/scripts/round4f/e2e-phone-landing-fling.cjs"
node "$ROOT/scripts/round4e/e2e-sign-in-pills.cjs"
node "$ROOT/scripts/round4e/e2e-part-sheet-more.cjs"
node --experimental-strip-types --test "$ROOT/src/lib/ui/landing-demo.test.ts"
node --experimental-strip-types --test "$ROOT/src/lib/ui/quote-progress-mobile.test.ts"
