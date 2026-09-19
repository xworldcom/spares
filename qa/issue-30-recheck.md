# Issue 30 — re-check on new preview

**Verdict: FIXED**

Confirm-only. No product change in this PR. Issues API returned 403 (`Resource not accessible by integration`), so this is the evidence record instead of a comment on https://github.com/xworldcom/spares/issues/30.

- Preview: `https://spares-evdd3mzx1-yonder3.vercel.app`
- Role: staff (`staff@spares.local`)
- Date: 2026-09-04, 04:18–04:21 UTC
- Protection: stays on. Unauthenticated HEAD → 302 `vercel.com/sso-api`, `x-robots-tag: noindex`
- Staff nav: Machines, Upload, Customers, Quotes, Bug reports

## Gate

On `/machines/new` (Upload), **only Upload** is highlighted. Machines must not stay active.

Also: Machines alone and Customers alone are exclusive.

## Steps

1. Opened the new preview and signed in as staff.
2. `/machines` — Machines only (`aria-current="page"` + dark pill).
3. `/machines/new` — Upload only. Machines is inactive.
4. `/staff/customers` — Customers only.
5. Returned to Machines (exclusive) and Upload (Upload only again).
6. Dual-record: nav screenshots + Console/Network on `/machines/new` at 04:21 UTC. Header detail pane kept closed.

## Expected vs actual

| Path | Expected active tab | Actual active tab(s) |
| --- | --- | --- |
| `/machines` | Machines only | Machines only |
| `/machines/new` | Upload only | **Upload only** (Machines inactive) |
| `/staff/customers` | Customers only | Customers only |

Repeated after return: same exclusive states. `aria-current="page"` matched the dark pill on every route.

## Dual-record (aligned clocks)

| Clock (desktop / UTC) | Surface | Notes |
| --- | --- | --- |
| 2026-09-04T04:18:25Z | programmatic walk | Gate JSON: all five exclusive checks true. See `gate.json` |
| Fri Sep 04 4:20 AM | `/machines` / `/machines/new` / `/staff/customers` | Exclusive pills. See `01`–`03` |
| Fri Sep 04 4:21 AM | `/machines/new` + Console | Upload only. Console empty of JS errors. See `04-upload-console-0421.png` |
| Fri Sep 04 4:21 AM | `/machines/new` + Network | Upload only. `/api/auth/me` 200 after login; document/assets 200 / 304. Header detail closed. See `05-upload-network-0421.png` |

Pre-login `GET /api/auth/me` 401 and `favicon.ico` 404 are unrelated to the nav gate. After staff login, `/api/auth/me` is 200.

Deployed staff nav uses longest-href-wins (`aria-current="page"`). `/machines/new` no longer also matches Machines.

## Screenshots

- [qa/issue-30-recheck-evidence/01-machines-only.png](issue-30-recheck-evidence/01-machines-only.png)
- [qa/issue-30-recheck-evidence/02-upload-only.png](issue-30-recheck-evidence/02-upload-only.png)
- [qa/issue-30-recheck-evidence/03-customers-only.png](issue-30-recheck-evidence/03-customers-only.png)
- [qa/issue-30-recheck-evidence/04-upload-console-0421.png](issue-30-recheck-evidence/04-upload-console-0421.png)
- [qa/issue-30-recheck-evidence/05-upload-network-0421.png](issue-30-recheck-evidence/05-upload-network-0421.png)
- Tight page crops: `01b` / `02b` / `03b`
