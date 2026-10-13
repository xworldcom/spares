# rv421 Mac proof gate — results spec

Authoritative harness: `scripts/rv421-mac-proof-gate.mjs`. Artifacts land in project-store `media/rv421-proof/` (`RESULTS.md`, `proof-summary.json`, pivot `RESULTS-rv430-<harness>-<sha>.md`).

## Dual gate (Kevin)

| Phase | Checkout | Expect |
|-------|----------|--------|
| **A** | Product files from `2b0ae4f` + harness @ branch HEAD | Bite rows **FAIL** (old behavior) |
| **B** | Full branch HEAD | **GREEN** |

## v16d harness (peek band + BOM scoping)

- Peek-band rows require `is-peek` and height ≤ 96px; Close uses tap @390; care H1 uses fresh navigation per actor.
- BOM rows scope `section[data-parts-bom]` / `aside.machine-bom` (no nested list `data-parts-bom`).

## v16c rows (hardware-fixture, `user@demo.com`)

| Row ID | Viewports | Actor | Pass |
|--------|-----------|-------|------|
| `bea-3d-part-camera-stable` | 390, 1440 | Customer `/machines/hardware-fixture` — two 3D canvas taps | `data-viewer-orbit` on layout stable within ε across taps (no camera reset on part change) |
| `bea-parts-panel-close-chrome` | 390, 1440 | List → pick part → part sheet | `[data-part-sheet-close]` in `[data-part-sheet-header]`, ≥44×44px, top of panel |

## v16b rows (Sam / Care / Bea phone)

| Row ID | Notes |
|--------|--------|
| `sam-close-q26`, `sam-close-q29`, `sam-close-ticket9` | Peek band `hBefore` ≤130px; Close must not grow (~60→140); Close visible |
| `sam-messages-close-scroll` | Same peek Close + page scroll; height stable |
| `sam-care-sort-stable` | Focus `#care-tickets-search` before type; sort offset stable; no filter/list horizontal overflow |
| `sam-ticket-search-t9` | `T9` / `9` → **Ticket 9** first in list |
| `bea-m9-phone-390` | `button[data-quote-tray]` → expand handle; Remove/Undo in 844px viewport |
| `bea-h1-care-sheet` | Mouse + touch care sheet drag; controls above tab bar |
| `bea-phone-3d-fs` | Immersive overlay; header/tabs hidden; layout ≥86% viewport |

## v16 legacy bite rows

See `internal/rv430-live-vs-gate-v16-rca.md` in the Project store for Phase-A false-GREEN history and RCA.
