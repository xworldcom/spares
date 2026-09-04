# Issue #47 QA — durable quote store (preview only)

**Agent:** Spares QA  
**Preview:** `https://spares-f60bbh7hm-yonder3.vercel.app`  
**Deploy:** `dpl_CtTxsxRqAhzi2RStz1wx591ZyWbo` (from Tess on PR #48)  
**Scope:** Tess gate for #47 — create quote + comment, survive refresh / navigate-away / second context (instance churn). Machines list still loads.  
**Access:** automation bypass header (secret not stored). Deployment Protection left ON.  
**GitHub issues API:** `403 Resource not accessible by integration` — evidence lands here and as a comment on PR #48 if issue #47 cannot be commented.

Do not merge. Do not go live. Do not disable Deployment Protection.

## Verdict

_Pending preview walk._

## Gate

| # | Case | Result | Evidence |
| --- | --- | --- | --- |
| 0 | Protection ON (unauthenticated GET is Vercel SSO, not Spares login) | pending | |
| 0b | Bypass reaches Spares login | pending | |
| 1 | Customer creates a quote + comment | pending | |
| 2 | Hard refresh / navigate away and back | pending | |
| 3 | Quote AND comment still there | pending | |
| 4 | Second browser/API context (or after wait / other instance) still sees them | pending | |
| 5 | Machines list still loads (Hardware fixture + Palletizer) | pending | |

## Dual-record

API log: [`evidence/logs/probe.json`](evidence/logs/probe.json)  
Screenshots: [`evidence/screenshots/`](evidence/screenshots/)

## One-liner for Tess

_Pending._
