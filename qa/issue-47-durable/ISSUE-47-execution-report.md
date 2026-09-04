# Issue #47 QA — durable quote store (preview only)

**Agent:** Spares QA  
**Preview:** `https://spares-f60bbh7hm-yonder3.vercel.app`  
**Deploy:** `dpl_CtTxsxRqAhzi2RStz1wx591ZyWbo` (Tess on [PR #48](https://github.com/xworldcom/spares/pull/48))  
**Scope:** Tess gate for #47 — create quote + comment, survive refresh / navigate-away / second context (instance churn). Machines list still loads.  
**Access:** automation bypass header (secret not stored). Deployment Protection left ON.  
**GitHub issues API:** `403 Resource not accessible by integration` — evidence lands here and as a comment on PR #48.

Do not merge. Do not go live. Do not disable Deployment Protection.

## Verdict

**FIXED** for #47 on this private preview.

Quotes and activity comments survive hard refresh, navigate-away, a second browser context (staff), and a new API session after a 35s wait across different `x-vercel-id` isolates. Machines list still returns Hardware fixture + Palletizer. Unauthenticated GET still 302s to Vercel SSO.

## Gate

| # | Case | Result | Evidence |
| --- | --- | --- | --- |
| 0 | Protection ON (unauthenticated GET is Vercel SSO, not Spares login) | **PASS** | `probe.json` protection-check: **302** to `vercel.com/sso-api` |
| 0b | Bypass reaches Spares login | **PASS** | `00-login-screen.png` — Spares / Sign in, not SSO |
| 1 | Customer creates a quote + comment | **PASS** | UI Quote **2** + `03-comment-posted.png`; API Quote **1** in `probe.json` |
| 2 | Hard refresh / navigate away and back | **PASS** | `04-after-hard-refresh.png`, `05-machines-after-nav.png`, `06-quote-after-nav-back.png` |
| 3 | Quote AND comment still there | **PASS** | UI comment `QA-47 UI hop comment 2026-09-04T14:40Z` still on `/quotes/2`; API marker still on Quote 1 |
| 4 | Second context / after wait / other instance | **PASS** | Staff UI `07-staff-second-context.png` on `/staff/quotes/2`; API staff-c-after-wait GET 200 with marker; later staff corroborate 14:54Z |
| 5 | Machines list still loads (Hardware fixture + Palletizer) | **PASS** | `01-customer-machines.png`, `05-machines-after-nav.png`; API machines after wait + new staff session |

## Dual-record

Two independent writes, both still readable after hops:

| Record | Who | Note | Comment | Still there |
| --- | --- | --- | --- | --- |
| Quote 1 (`59b462b7-c1be-4368-b943-d2ee03162446`) | API customer 14:37:53Z | `QA-47 quote note 2026-09-04T14:37:52Z` | `QA-47 hop marker 2026-09-04T14:37:52Z` | Yes — staff GET 14:38:32Z (new session after 35s wait) and again 14:54:34Z |
| Quote 2 (`caa06306-c0b6-4fc7-ab28-3ec77ab151ce`) | UI customer ~14:44Z | `QA-47 UI quote note 2026-09-04T14:40Z` | `QA-47 UI hop comment 2026-09-04T14:40Z` | Yes — customer hard refresh 14:47, nav-back 14:48, staff second browser 14:52, staff API 14:54:35Z |

API log: [`evidence/logs/probe.json`](evidence/logs/probe.json)  
UI corroborate: [`evidence/logs/ui-corroborate.json`](evidence/logs/ui-corroborate.json)  
Screenshots: [`evidence/screenshots/`](evidence/screenshots/)

Clocks (UTC, 4 Sep 2026):

| Clock | What |
| --- | --- |
| 14:37:52 | Unauthenticated GET `/` → 302 Vercel SSO (protection ON) |
| 14:37:53 | Customer login 200 (`user-customer`); POST `/api/quotes` → Quote 1; POST activity with hop marker |
| 14:37:53–14:38:32 | Same quote+comment on customer re-GET, staff context, 35s wait, **new** staff session |
| 14:42 | UI: Spares landing (not SSO) |
| 14:43 | Customer machines: Hardware fixture + Palletizer |
| 14:44–14:46 | UI Quote 2 requested; comment posted |
| 14:47 | Hard refresh: comment still on `/quotes/2` |
| 14:47–14:48 | Navigate to `/machines` (both fixtures) then back to Quote 2 |
| 14:52 | Fresh staff browser: `/staff/quotes/2` shows the same customer comment |
| 14:54 | New staff API session still returns Quote 1 **and** Quote 2 with their comments |

`x-vercel-id` suffixes changed across the wait (create vs after-wait), so this is not a single warm isolate.

## Out of scope

Email, payments, go-live, merging PR #48. Deployment Protection stays ON.

## One-liner for Tess

**#47 FIXED** on the protected preview — Quote 1 (API) and Quote 2 (UI) plus their comments survived refresh, nav-away, staff second context, and a new session after wait; machines still list Hardware fixture + Palletizer. Evidence [PR #49](https://github.com/xworldcom/spares/pull/49) (issues 403).
