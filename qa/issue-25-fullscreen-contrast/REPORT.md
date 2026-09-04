# Issue #25 QA — fullscreen chrome contrast

**Verdict: CONFIRMED**

Spares QA (customer persona). Confirm only — no product fix in this PR.

Prefer attaching on [#25](https://github.com/xworldcom/spares/issues/25). This agent’s GitHub token gets `403 Resource not accessible by integration` on issues/comments, so freeze screenshots + dual-record logs land here.

Access used: automation bypass header (secret not stored). Deployment Protection was not changed. Preview is private and not live.

## Target

- Preview: `https://spares-er53thyle-yonder3.vercel.app`
- Path: `/machines/palletizer`
- Persona: `customer@spares.local` (seed customer; password not shown on the login screen)

## Repro

1. Open `/login` on the preview (Spares sign-in, not Vercel SSO).
2. Sign in as the customer seed.
3. Open **Palletizer** (`/machines/palletizer`).
4. Look at the 3D viewport chrome for the fullscreen expand control (`aria-label="Full screen"`, `[ ]` corners) at the top-right of the dark viewer.
5. Click it. Overlay fullscreen shows `aria-label="Exit full screen"` (`×`) in the same chrome.

## Expected vs actual

| | Expected | Actual |
| --- | --- | --- |
| Expand `[ ]` on normal chrome | Clearly visible against the dark viewport | Near-black icon on near-black viewport; hard to see |
| Exit `×` in fullscreen | Clearly visible close control | Same near-black glyph on the dark viewer; hard to see |

WCAG-style contrast from freeze pixels (relative luminance, sRGB):

| Control | Sample | Contrast |
| --- | --- | --- |
| Full screen `[ ]` (normal) | button box vs viewport | **1.01:1** (p10/p90); max 1.63:1 |
| Exit `×` (fullscreen) | button box vs viewport | **1.01:1** |
| Explode label (same chrome, control) | white text on dark viewer | **19.6:1** (readable) |

UI components need ≥ 3:1. These icons fail.

## Dual-record (clocks lined up)

Same Chrome session, `2026-09-04T02:58:00Z`–`02:58:17Z` (~17s).

| t (UTC) | relMs | Event |
| --- | --- | --- |
| 02:58:02.243 | — | Navigate `/login` (Spares form) |
| 02:58:04.808 | 3956 | Console error: 404 resource (favicon/other; not the model) |
| 02:58:05.579 | 4727 | Console error: `GET /api/auth/me` 401 (pre-login) |
| 02:58:06.528 | — | Submit customer login |
| 02:58:08.699 | — | Navigate `/machines/palletizer` |
| 02:58:09.5+ | 8683+ | WebGL software-fallback warnings (agent GPU); model still painted |
| 02:58:11+ | — | Freeze: normal chrome + expand crop |
| 02:58:12+ | — | Click Full screen; freeze: overlay + exit `×` crop |

Network (redacted headers/cookies/bypass): `GET /api/auth/login` path via form → `GET /api/machines` 200 → `GET /api/machines/palletizer` 200 → `GET /api/machines/palletizer/file` 200. Model loaded. No 403 from Vercel protection after bypass.

Logs: [`evidence/logs/console.json`](evidence/logs/console.json), [`evidence/logs/network.json`](evidence/logs/network.json), [`evidence/logs/summary.json`](evidence/logs/summary.json).

## Freeze screenshots (pass/fail)

- [`00-login.png`](evidence/screenshots/00-login.png) — Spares login (not Vercel SSO)
- [`02-after-login-machines.png`](evidence/screenshots/02-after-login-machines.png) — customer session; Palletizer in the list
- [`04-normal-chrome-expand-icon.png`](evidence/screenshots/04-normal-chrome-expand-icon.png) — **FAIL**: `[ ]` almost invisible on the dark viewer
- [`05-expand-icon-crop.png`](evidence/screenshots/05-expand-icon-crop.png) — crop of that control
- [`06-fullscreen-exit-x.png`](evidence/screenshots/06-fullscreen-exit-x.png) — **FAIL**: fullscreen chrome; `×` not readable
- [`07-exit-x-crop.png`](evidence/screenshots/07-exit-x-crop.png) — crop of the exit control

## Computed style (same session)

Both controls carry `bg-white text-[#0b0d10]`:

- `color`: `rgb(11, 13, 16)` (`#0b0d10`)
- `backgroundColor`: `rgba(0, 0, 0, 0)` — **white pill does not paint**
- Viewport / canvas chrome is `#0b0d10` / near-black

So the glyph is the intended dark ink, but the light disc never appears → black-on-black.

Observation for Tess (not a fix in this PR): shipped CSS includes both `.bg-white{background-color:var(--color-white)}` and a Preflight `button{background-color:#0000}`. Computed background matches the transparent Preflight, not `bg-white`.

## Out of scope

No feature code. No merge. Deployment Protection left on. Not live.
