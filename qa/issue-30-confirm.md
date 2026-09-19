# Issue 30 — Spares QA confirm (dual nav highlight)

**Verdict: CONFIRMED**

Confirm gate is the dual nav highlight only. No product fix in this change. Issues API returned 403 (`Resource not accessible by integration`), so this PR is the evidence record instead of an issue comment.

- Preview: `https://spares-er53thyle-yonder3.vercel.app`
- Role: staff (`staff@spares.local`)
- Date: 2026-09-04, 03:37–03:48 UTC
- Staff nav labels on this preview: Machines, Upload, Customers, Quotes, Bug reports
- Upload / Uploads tab path: `/machines/new` (page title “Upload pack”)

## Steps

1. Opened the preview and signed in as staff.
2. Opened Machines list (`/machines`).
3. Clicked **Upload** (`/machines/new`).
4. Clicked Customers, Quotes, then back to Machines and Upload.
5. Dual-recorded nav screenshots plus Console/Network on `/machines/new` with the desktop clock visible.

## Expected vs actual

| Path | Expected active tab | Actual active tab(s) |
| --- | --- | --- |
| `/machines` | Machines only | Machines only |
| `/machines/new` | Upload only | **Machines and Upload both highlighted** (dark pill, white text) |
| `/staff/customers` | Customers only | Customers only |
| `/staff/quotes` | Quotes only | Quotes only |

Reproduced twice: first after Machines → Upload (03:38), again after returning from Machines (03:39). Customers and Quotes stay exclusive. Active state is exclusive everywhere except Upload / `/machines/new`.

## Dual-record (aligned clocks)

| Clock (desktop / UTC) | Surface | Notes |
| --- | --- | --- |
| Fri Sep 04 3:37 AM | `/machines` nav | Machines only. See `01-machines-list-nav.png` |
| Fri Sep 04 3:38 AM | `/machines/new` nav | Dual highlight. See `02-uploads-dual-highlight.png` |
| Fri Sep 04 3:38 AM | `/staff/customers` nav | Customers only. See `03-customers-exclusive-nav.png` |
| Fri Sep 04 3:38 AM | `/staff/quotes` nav | Quotes only. See `04-quotes-exclusive-nav.png` |
| Fri Sep 04 3:39 AM | `/machines` after return | Machines only. See `05-machines-after-return-nav.png` |
| Fri Sep 04 3:47 AM | `/machines/new` + Console | Dual highlight still present. Console empty of JS errors. See `06-uploads-console-0347.png` |
| Fri Sep 04 3:47 AM | `/machines/new` + Network | Dual highlight still present. Document/assets 200 / 204 / 304. Header detail pane kept closed. See `07-uploads-network-0347.png` |
| 2026-09-04T03:48:17Z | HTTP check | `POST /api/auth/login` 200 staff session; `GET /api/auth/me` 200; `/machines`, `/machines/new`, `/staff/customers`, `/staff/quotes` all 200 HTML |

Nav highlight is a client render issue. Page loads succeeded; Console on the failing route did not show a JS exception that would explain the dual pill.

## Secondary note (not the confirm gate)

Kevin’s body also asked for Customers to list customer accounts plus files they can access, with add/remove files.

**That UI does not exist today.** `/staff/customers` is a create-account form only (customer email, temporary password, Create customer). No account list, no file-access list, no add/remove files. Tess routes any product follow-up.

## Screenshots

- [qa/issue-30-evidence/01-machines-list-nav.png](issue-30-evidence/01-machines-list-nav.png)
- [qa/issue-30-evidence/02-uploads-dual-highlight.png](issue-30-evidence/02-uploads-dual-highlight.png)
- [qa/issue-30-evidence/03-customers-exclusive-nav.png](issue-30-evidence/03-customers-exclusive-nav.png)
- [qa/issue-30-evidence/04-quotes-exclusive-nav.png](issue-30-evidence/04-quotes-exclusive-nav.png)
- [qa/issue-30-evidence/05-machines-after-return-nav.png](issue-30-evidence/05-machines-after-return-nav.png)
- [qa/issue-30-evidence/06-uploads-console-0347.png](issue-30-evidence/06-uploads-console-0347.png)
- [qa/issue-30-evidence/07-uploads-network-0347.png](issue-30-evidence/07-uploads-network-0347.png)
