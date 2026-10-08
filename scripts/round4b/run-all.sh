#!/usr/bin/env bash
# Usage: scripts/round4b/run-all.sh <base-url> <before|after> [out-dir]
# Needs `next build && next start` on <base-url>. Exit code is non-zero if any check fails.
set -u
BASE="$1"; TAG="$2"; OUT="${3:-/cursor/stores/self/media/round4b}"
mkdir -p "$OUT"
rc=0
for t in tracking-empty add-latency tray-line-names tray-lifecycle-restored send-nav-guard phone-landing hidden-parts; do
  echo "== $TAG $t"
  R4_BASE="$BASE" R4_TAG="$TAG" R4_OUT="$OUT" node "$(dirname "$0")/e2e-$t.cjs" 2>&1 | grep -v '^    at ' || true
  [ "${PIPESTATUS[0]}" -eq 0 ] || rc=1
done
exit $rc
