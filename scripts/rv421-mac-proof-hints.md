# rv421 Mac proof — harness hints (fold into `~/spares-gate/scripts/rv421-*`)

## Mac v15 — authoritative checkout (Kevin)

The gate records **Mac checkout HEAD** (`git rev-parse HEAD` in the repo where you run the gate), **not** a stale bundle filename.

1. **Preferred:** `~/spares-gate` checked out to the pushed branch SHA (e.g. `git fetch && git checkout cursor/rv430-live-fail-v13-31b9 && git rev-parse HEAD`).
2. **Or:** clone/fetch from a fresh `rv421-batch.bundle` and confirm `git bundle list-heads ~/rv421-batch.bundle` contains that SHA on the expected branch.
3. Before reporting GREEN, open `RESULTS.md` (or pivot `RESULTS-rv430-v15-<shortSha>.md`) and verify **Mac checkout HEAD** matches the SHA you intend to ship. If `~/rv421-batch.bundle list-heads` shows an older commit, refresh the bundle — do not treat list-heads as the tested SHA unless you cloned from it and `rev-parse HEAD` matches.

Optional: set `RV421_BATCH_BUNDLE` to the project-store bundle path when auditing; gate writes its `list-heads` into RESULTS.

```bash
cd ~/spares-gate
node scripts/rv421-mac-proof-seed.mjs
npm run build
RV421_PROOF_DATA_DIR=/tmp/oee360-rv421-proof-… ./scripts/rv421-mac-proof-server.sh &
RV421_GATE_BASE=http://127.0.0.1:3019 node scripts/rv421-mac-proof-gate.mjs
```

## Item 8 — `/machines/hardware-fixture`

Staff **View part** links render in the 3D chrome when the machine has announced/obsolete lifecycle parts (no BOM row select required). Harness may still click a part first to assert the chip link.

## Item 7 @1440

**Quote detail:** inline Messages column from **1280px** (`useQuoteConversationDockStage`) — gate v3 asserts `.conversation-sheet.is-inline` @1440, not overlay handle.

**Care / tickets:** overlay snap below **1536px** — open Messages before Close assertions @390.

## sam-close-ticket9 @390

Use hub path **`/care/tickets/{id}`** (not machine-scoped). Harness: `node scripts/rv421-sam-close-ticket9.mjs`.

Care ticket detail uses overlay snap below 1536px; confirm viewport width before querying `.snap-sheet-handle`.

## Item 5 — `document.title` (staff lists)

- **`/staff/quotes`:** SSR `metadata.title: "Quotes"` + `DocumentTitle`; expect `Quotes · OEE360`.
- **`/staff/tickets`** (redirects to hub): SSR `metadata.title: "All tickets"` on staff + `/care/tickets` layout; `DocumentTitle` outside Suspense. WebKit @390: wait for `All tickets · OEE360`, not bare `OEE360`.
