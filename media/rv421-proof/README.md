# rv421 / rv428 / rv430 proof gate — Mac checkout (no push to main)

**Branch:** `cursor/rv430-deferred-v16g-followup-9e78`  
**PR:** [#435](https://github.com/xworldcom/spares/pull/435) partial merged → `main` @ `46bf3a7`; deferred follow-up on this branch  
**Bundle:** `rv421-batch.bundle` (this folder — **stale @ `74f006c`**; GitHub 100MB cap blocks in-repo refresh)

## Authoritative SHA (fetch branch)

**Gate HEAD:** `bd05b5f870c20c10b63626fdaff97a39370c2e6d` (`bd05b5f`)

```bash
git fetch origin cursor/rv430-deferred-v16g-followup-9e78
git checkout cursor/rv430-deferred-v16g-followup-9e78
git rev-parse HEAD   # expect bd05b5f…
```

**`git bundle list-heads rv421-batch.bundle`** (committed copy still @ prior tip):

```
74f006c775500a54f331364523dfd13450272545 refs/heads/cursor/rv430-deferred-gate-rows-bd61
```

Regenerate locally after pull:  
`git bundle create ~/rv421-batch.bundle HEAD refs/heads/cursor/rv430-deferred-v16g-followup-9e78`

Harness **v16g (deferred rows)** — `#433` orbit probe + `#434` part sheet close; split-pane Sam @1440; Messages/H1/M9 + sam-close bite rows.

The gate labels **Mac checkout HEAD** in `RESULTS.md`, `proof-summary.json`, and `RESULTS-rv430-v16g-<shortSha>.md`.

**Dual gate bar (#435 deferred matrix):**

1. **Phase A** — product files from `2b0ae4f` + harness @ bundle HEAD → deferred bite rows must **FAIL** (pre-fix behavior)
2. **Phase B** — full tree @ **branch HEAD `bd05b5f`** → **GREEN** on full matrix

Run both viewports — default harness is `390,1440` (`RV421_GATE_VIEWPORTS`).

**HTTPS fallback (no `git fetch`):** prefer `git fetch` above; raw bundle URL may lag until a new bundle is published.

## Clone on Mac

```bash
git clone https://github.com/xworldcom/spares.git ~/spares-gate
cd ~/spares-gate
git fetch origin cursor/rv430-deferred-v16g-followup-9e78
git checkout cursor/rv430-deferred-v16g-followup-9e78
npm ci
node scripts/rv421-mac-proof-seed.mjs
npm run build
RV421_PROOF_DATA_DIR=/tmp/oee360-rv421-proof-… ./scripts/rv421-mac-proof-server.sh &
RV421_GATE_VIEWPORTS=390,1440 RV421_GATE_BASE=http://127.0.0.1:3019 node scripts/rv421-mac-proof-gate.mjs
```
