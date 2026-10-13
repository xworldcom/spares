# rv421 / rv428 / rv430 proof gate — Mac checkout (no push to main)

**Branch:** `cursor/rv430-live-v16-f338`  
**Bundle:** `rv421-batch.bundle` (this folder)

**`git bundle list-heads rv421-batch.bundle`:**

```
f1448a67aa686d1c216322dc938d07d1e643381f refs/heads/cursor/rv430-live-v16-f338
```

Harness **v16d** — v16c #433/#434 rows + scoped BOM; peek-band Close (tap @390), care H1 detent, focus-click care sort.

## Authoritative SHA (Kevin v16d re-gate)

**HEAD:** `f1448a67aa686d1c216322dc938d07d1e643381f` (`f1448a6`)

The gate labels **Mac checkout HEAD** in `RESULTS.md`, `proof-summary.json`, and `RESULTS-rv430-v16d-<shortSha>.md`.

**Dual gate bar (coordinator):**

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
git rev-parse HEAD   # expect f1448a67aa686d1c216322dc938d07d1e643381f
npm ci
node scripts/rv421-mac-proof-seed.mjs
npm run build
RV421_PROOF_DATA_DIR=/tmp/oee360-rv421-proof-… ./scripts/rv421-mac-proof-server.sh &
RV421_GATE_BASE=http://127.0.0.1:3019 node scripts/rv421-mac-proof-gate.mjs
```
