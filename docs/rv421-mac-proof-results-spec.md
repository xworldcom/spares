# rv421 Mac proof gate — results spec

Authoritative harness: `scripts/rv421-mac-proof-gate.mjs`. Artifacts land in project-store `media/rv421-proof/` (`RESULTS.md`, `proof-summary.json`, pivot `RESULTS-rv430-<harness>-<sha>.md`).

## Dual gate (Kevin)

| Phase | Checkout | Expect |
|-------|----------|--------|
| **A** | Product files from `2b0ae4f` + harness @ branch HEAD | **Remaining** bite rows **FAIL** (old behavior) |
| **B** | Full branch HEAD | **GREEN** on remaining matrix |

Deferred live-fail rows (Messages close, H1, M9 @390, ticket9 bite, etc.) ship in follow-up PR `cursor/rv430-deferred-gate-rows-bd61` — see `internal/rv430-pr432-split-scope.md`.

## v16f ship scope (#432)

**Harness:** `v16f` on `cursor/rv430-live-v16-f338`.

**Product (this PR):**

- `#433` — `bea-3d-part-camera-stable` (camera does not reset on part pick; `data-viewer-orbit` published)
- `#434` — `bea-parts-panel-close-chrome` (header close, 44×44)
- Live fixes kept: immersive phone 3D FS, care search ranking, care sort @390 filter layout, qty decimal/refocus, staff nav, drawer/FS rows

**Harness:**

- `bea-3d-part-camera-stable` — layout visible → canvas visible → `data-viewer-canonical-ready` + orbit (no swallowed wait)
- Legacy row `7` / `sam-close-*` uses v15g `assertCloseSettlesPeek` (not v16e bite band)
- **Not in matrix:** `sam-messages-close-scroll`, `bea-h1-care-sheet`, `bea-m9-phone-390`

## v16c rows (hardware-fixture, `user@demo.com`)

| Row ID | Viewports | Actor | Pass |
|--------|-----------|-------|------|
| `bea-3d-part-camera-stable` | 390, 1440 | Customer `/machines/hardware-fixture` — two 3D canvas taps | `data-viewer-orbit` stable within ε across taps |
| `bea-parts-panel-close-chrome` | 390, 1440 | List → pick part → part sheet | `[data-part-sheet-close]` in header, ≥44×44 |

## v16 ship bite rows (Phase A @ `2b0ae4f`)

| Row | Notes |
|-----|--------|
| `bea-phone-3d-fs` | Immersive overlay; header/tabs hidden |
| `bea-3d-part-camera-stable` | Orbit stable (#433) |
| `bea-parts-panel-close-chrome` | Header close (#434) |
| `sam-ticket-search-t9` | Ticket 9 first for `T9` / `9` |
| `sam-care-sort-stable` | Focus-before-type; filter `overflow-x: hidden` @≤430px |

## v16 legacy RCA

See Project store `internal/rv430-live-vs-gate-v16-rca.md` and deferred PR for Sam Messages / H1 / M9 rows.
