# rv421 Mac proof gate — results spec

Authoritative harness: `scripts/rv421-mac-proof-gate.mjs`. Artifacts land in project-store `media/rv421-proof/` (`RESULTS.md`, `proof-summary.json`, pivot `RESULTS-rv430-<harness>-<sha>.md`).

## Dual gate (Kevin)

| Phase | Checkout | Expect |
|-------|----------|--------|
| **A** | Product files from `2b0ae4f` + harness @ branch HEAD | **Remaining** bite rows **FAIL** (old behavior) |
| **B** | Full branch HEAD | **GREEN** on remaining matrix |

Deferred live-fail rows (Messages close, H1, M9 @390, ticket9 bite, etc.) ship in follow-up PR `cursor/rv430-deferred-gate-rows-bd61` — see `internal/rv430-pr432-split-scope.md`.

## v16f ship scope (#432 @ `ea1e682`)

**Harness:** `v16f` on `main`.

**Product (shipped):** immersive phone 3D FS, care search ranking (list-only @390), care sort @390 filter layout, qty decimal/refocus, staff nav, drawer/FS rows.

**Deferred to [#435](https://github.com/xworldcom/spares/pull/435):** split-pane ticket search @1440, desktop care filter chrome, `#434` part sheet close, `#433` orbit probe for gate, Messages/H1/M9 bite rows.

## v16g deferred (#435)

**Harness:** `v16g` on `cursor/rv430-deferred-gate-rows-bd61`.

**Product:**

- `#433` — `bea-3d-part-camera-stable` (`data-viewer-orbit` published on controls change; live @1440 already stable on `ea1e682`)
- `#434` — `bea-parts-panel-close-chrome` (header close, 44×44)
- Split-pane care: ticket search `T9`/`9` with selected row; desktop filter row overflow + sort target
- Legacy deferred: `sam-messages-close-scroll`, `bea-h1-care-sheet`, `bea-m9-phone-390`, `sam-close-*` bite band

**Harness @1440 (Sam split):**

- `sam-ticket-search-t9` — `/care/tickets/34` split; first row ticket 9 for `T9` and `9` (`?q=9` must refresh list)
- `sam-care-sort-stable` — `/care/tickets/34` split; filter `overflow-x: hidden`; sort 0px shift on focus

## v16 ship bite rows (Phase A @ `2b0ae4f`)

| Row | Notes |
|-----|--------|
| `bea-phone-3d-fs` | Immersive overlay; header/tabs hidden |
| `sam-ticket-search-t9` | Ticket 9 first for `T9` / `9` |
| `sam-care-sort-stable` | Focus-before-type; filter `overflow-x: hidden` @≤430px and split @1440 |

## v16 legacy RCA

See Project store `internal/rv430-live-vs-gate-v16-rca.md` and deferred PR for Sam Messages / H1 / M9 rows.
