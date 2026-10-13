# rv421 / rv428 / rv430 proof gate — Mac checkout (no push to main)

**Branch:** `cursor/rv430-deferred-gate-rows-bd61`  
**PR:** [#435](https://github.com/xworldcom/spares/pull/435)  
**Bundle:** `rv421-batch.bundle` (this folder)

**`git bundle list-heads rv421-batch.bundle`:**

```
74f006c775500a54f331364523dfd13450272545 refs/heads/cursor/rv430-deferred-gate-rows-bd61
```

Harness **v16g (deferred rows)** — `#433` orbit probe + `#434` part sheet close; split-pane Sam @1440; Messages/H1/M9 + sam-close bite rows. Prior ship scope remains on `main` / v16f (`cursor/rv430-live-v16-f338`).

## Authoritative SHA

**HEAD:** `74f006c775500a54f331364523dfd13450272545` (`74f006c`)

The gate labels **Mac checkout HEAD** in `RESULTS.md`, `proof-summary.json`, and `RESULTS-rv430-v16g-<shortSha>.md`.

**Dual gate bar (#435 deferred matrix):**

1. **Phase A** — product files from `2b0ae4f` + harness @ bundle HEAD → deferred bite rows must **FAIL** (pre-fix behavior)
2. **Phase B** — full tree @ bundle HEAD → **GREEN** on full matrix

Run both viewports — default harness is `390,1440` (`RV421_GATE_VIEWPORTS`). Live already passed `#433` `bea-3d-part-camera-stable` @**1440** only; the gate must also cover @**390**.

**HTTPS fallback (no `git fetch`):**  
https://github.com/xworldcom/spares/raw/cursor/rv430-deferred-gate-rows-bd61/media/rv421-proof/rv421-batch.bundle  
After download, run `git bundle list-heads` locally — must match the line above.

## Clone on Mac

```bash
cp /path/to/rv421-batch.bundle ~/rv421-batch.bundle
git clone -b cursor/rv430-deferred-gate-rows-bd61 ~/rv421-batch.bundle ~/spares-gate
cd ~/spares-gate
git rev-parse HEAD   # expect 74f006c775500a54f331364523dfd13450272545
npm ci
node scripts/rv421-mac-proof-seed.mjs
npm run build
RV421_PROOF_DATA_DIR=/tmp/oee360-rv421-proof-… ./scripts/rv421-mac-proof-server.sh &
RV421_GATE_VIEWPORTS=390,1440 RV421_GATE_BASE=http://127.0.0.1:3019 node scripts/rv421-mac-proof-gate.mjs
```
