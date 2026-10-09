#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BASE="${1:-http://127.0.0.1:3010}"
cd "$ROOT"
node --experimental-strip-types --test "$ROOT/src/lib/ui/conversation-sheet.test.ts"
node "$ROOT/scripts/care-notes-chunk2/e2e-phone-sheet-detents.cjs" "$BASE" 390 844
node "$ROOT/scripts/care-notes-chunk2/e2e-phone-sheet-detents.cjs" "$BASE" 320 568
node "$ROOT/scripts/care-notes-chunk2/e2e-phone-sheet-close-sync.cjs" "$BASE" 390 844
node "$ROOT/scripts/care-notes-chunk2/e2e-phone-sheet-close-sync.cjs" "$BASE" 320 568
node "$ROOT/scripts/care-notes-chunk2/e2e-phone-sheet-drag-1to1.cjs" "$BASE" 390 844
node "$ROOT/scripts/care-notes-chunk2/e2e-phone-sheet-drag-1to1.cjs" "$BASE" 320 568
node "$ROOT/scripts/care-notes-chunk2/e2e-phone-sheet-release-frames.cjs" "$BASE" 390 844
node "$ROOT/scripts/care-notes-chunk2/e2e-phone-sheet-release-frames.cjs" "$BASE" 320 568
node "$ROOT/scripts/care-notes-chunk2/e2e-phone-sheet-round3.cjs" "$BASE" 390 844
node "$ROOT/scripts/care-notes-chunk2/e2e-phone-sheet-round3.cjs" "$BASE" 320 568
node "$ROOT/scripts/care-notes-chunk2/e2e-phone-sheet-round4.cjs" "$BASE" 390 844
node "$ROOT/scripts/care-notes-chunk2/e2e-phone-sheet-round4.cjs" "$BASE" 320 568
node "$ROOT/.cursor/skills/verify-oee360/scripts/sheet-close-probe.mjs" "$BASE"
