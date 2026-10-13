# rv421 / rv428 / rv430 proof gate — Mac checkout (no push to main)

**Branch:** `cursor/rv430-live-v16-f338`  
**Bundle:** `rv421-batch.bundle` (this folder)

**`git bundle list-heads rv421-batch.bundle`:**

```
6ebf42cff1b728f411423467178a016a16e9feb3 refs/heads/cursor/rv430-live-v16-f338
```

Harness **v16f (ship scope)** — #433/#434 3D + part sheet; immersive phone FS; care search/sort; legacy row-7 close. Deferred Messages/H1/M9 rows: `cursor/rv430-deferred-gate-rows-bd61`.

## Authoritative SHA

**HEAD:** `6ebf42cff1b728f411423467178a016a16e9feb3` (`6ebf42c`)

The gate labels **Mac checkout HEAD** in `RESULTS.md`, `proof-summary.json`, and `RESULTS-rv430-v16f-<shortSha>.md`.

**Dual gate bar (remaining rows only):**

1. **Phase A** — product files from `2b0ae4f` + harness @ bundle HEAD → bite rows must **FAIL**
2. **Phase B** — full tree @ bundle HEAD → **GREEN**

**HTTPS fallback (no `git fetch`):**  
https://github.com/xworldcom/spares/raw/cursor/rv430-live-v16-f338/media/rv421-proof/rv421-batch.bundle  
After download, run `git bundle list-heads` locally — must match the line above.

## Clone on Mac

```bash
cp /path/to/rv421-batch.bundle ~/rv421-batch.bundle
git clone -b cursor/rv430-live-v16-f338 ~/rv421-batch.bundle ~/spares-gate
cd ~/spares-gate
git rev-parse HEAD   # expect 6ebf42cff1b728f411423467178a016a16e9feb3
npm ci
node scripts/rv421-mac-proof-seed.mjs
npm run build
RV421_PROOF_DATA_DIR=/tmp/oee360-rv421-proof-… ./scripts/rv421-mac-proof-server.sh &
RV421_GATE_BASE=http://127.0.0.1:3019 node scripts/rv421-mac-proof-gate.mjs
```
