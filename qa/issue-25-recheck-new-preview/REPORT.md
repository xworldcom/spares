# Issue #25 QA re-check — new preview fullscreen chrome

**Verdict: FIXED**

Spares QA (customer persona). Confirm only — no product fix in this PR.

Prefer attaching on [#25](https://github.com/xworldcom/spares/issues/25). This agent’s GitHub token gets `403 Resource not accessible by integration` on issues/comments, so freeze screenshots + dual-record logs land here.

Access used: automation bypass header (secret not stored). Deployment Protection was not changed. Preview is private and not live.

Prior confirm (still broken) was [#28](https://github.com/xworldcom/spares/pull/28) on `https://spares-er53thyle-yonder3.vercel.app` at **1.01:1**. This re-check is the new preview from the chrome-chip fix ([#27](https://github.com/xworldcom/spares/pull/27)).

## Target

- Preview: `https://spares-88zuixxl3-yonder3.vercel.app`
- Path: `/machines/palletizer`
- Persona: `customer@spares.local` (seed customer; password not shown on the login screen)

## Access (protection ON)

- Unauthenticated `HEAD /login` → **302** to `vercel.com/sso-api` (Deployment Protection on).
- With automation bypass header (not stored): first hop **307** + protection cookie, then **200** Spares login HTML. No Vercel SSO page after bypass.
- `POST /api/auth/login` 200 → customer session. `GET /api/machines/palletizer` 200. `GET /api/machines/palletizer/file` 200.

## Repro

1. Open `/login` on the preview (Spares sign-in, not Vercel SSO).
2. Sign in as the customer seed.
3. Open **Palletizer** (`/machines/palletizer`).
4. Look at the 3D viewport chrome for the fullscreen expand control (`aria-label="Full screen"`, `[ ]` corners) at the top-right of the dark viewer.
5. Click it. Overlay fullscreen shows `aria-label="Exit full screen"` (`×`) in the same chrome.

## Expected vs actual

| | Expected | Actual |
| --- | --- | --- |
| Expand `[ ]` on normal chrome | Clearly visible against the dark viewport | Light chip (`#f4f5f7`) with ink `[ ]`; readable |
| Exit `×` in fullscreen | Clearly visible close control | Same light chip with ink `×`; readable |

WCAG-style contrast (relative luminance, sRGB), same Chrome session:

| Control | Sample | Contrast |
| --- | --- | --- |
| Full screen `[ ]` (normal) | computed chip vs stage `#0b0d10` | **17.84:1** |
| Full screen `[ ]` (normal) | freeze pixels p10/p90 in button box | **14.27:1** |
| Exit `×` (fullscreen) | computed chip vs stage | **17.84:1** |
| Exit `×` (fullscreen) | freeze pixels p10/p90 | **14.45:1** |

UI components need ≥ 3:1. Both pass. Prior preview failed at 1.01:1.

## Dual-record (clocks lined up)

Same Chrome session, `2026-09-04T04:49:35.808Z`–`04:49:46.723Z` (~11s).

| t (UTC) | relMs | Event |
| --- | --- | --- |
| 04:49:37.410 | 1602 | `GET /login` 307 (protection cookie hop) |
| 04:49:37.500 | 1692 | `GET /login` 200 — Spares form, not Vercel SSO |
| 04:49:37.987 | 2179 | Console: `GET /api/auth/me` 401 (pre-login) |
| 04:49:38.017 | 2209 | Console: 404 resource (not the model) |
| 04:49:38.747 | 2939 | `POST /api/auth/login` 200 |
| 04:49:40.325 | 4517 | `GET /machines/palletizer` 200 |
| 04:49:40.821 | 5013 | `GET /api/machines/palletizer` 200 |
| 04:49:41.326 | 5518 | `GET /api/machines/palletizer/file` 200 |
| 04:49:41.2+ | 5432+ | WebGL software-fallback / ReadPixels stalls (agent GPU); model still painted |
| 04:49:43+ | — | Freeze: normal chrome + expand crop |
| 04:49:44+ | — | Click Full screen; freeze: overlay + exit `×` crop |

Network headers/cookies/bypass redacted. No 403 from Vercel protection after bypass. No `vercel.com/sso` hit in the authenticated session.

Logs: [`evidence/logs/console.json`](evidence/logs/console.json), [`evidence/logs/network.json`](evidence/logs/network.json), [`evidence/logs/summary.json`](evidence/logs/summary.json).

## Freeze screenshots (pass/fail)

- [`00-login.png`](evidence/screenshots/00-login.png) — Spares login (not Vercel SSO)
- [`02-after-login-machines.png`](evidence/screenshots/02-after-login-machines.png) — customer session; Palletizer in the list
- [`04-normal-chrome-expand-icon.png`](evidence/screenshots/04-normal-chrome-expand-icon.png) — **PASS**: `[ ]` on a light chip against the dark viewer
- [`05-expand-icon-crop.png`](evidence/screenshots/05-expand-icon-crop.png) — crop of that control
- [`06-fullscreen-exit-x.png`](evidence/screenshots/06-fullscreen-exit-x.png) — **PASS**: fullscreen chrome; `×` readable on the light chip
- [`07-exit-x-crop.png`](evidence/screenshots/07-exit-x-crop.png) — crop of the exit control

## Computed style (same session)

Both controls carry `viewer-chrome-chip`:

- `color`: `rgb(11, 13, 16)` (`#0b0d10`)
- `backgroundColor`: `rgb(244, 245, 247)` (`#f4f5f7`) — **chip paints** (was `rgba(0, 0, 0, 0)` on the old preview)
- Viewport / canvas chrome remains `#0b0d10` / near-black

Ink icon on paper chip, paper chip on dark stage. Not black-on-black.

## Out of scope

No feature code. No merge. Deployment Protection left on. Not live.
