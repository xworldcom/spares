# Spares

Spares is a private industrial spare-parts platform.

Internal staff upload a machine pack. Customers log in, inspect and rotate a machine in the browser, pick a named part, and request a quote.

This repository is **private by default**. The product is **not live**. Do not deploy this app to a public production URL, attach a public custom domain, or turn on public signup.

## What this pass is (T3.0)

One shared quote workspace for customer and staff. Private preview only. Not live.

Status pipeline: `requested` → `in_review` → `pricing` → `quoted` → `po_received` → `confirmed` → `ordered` → `shipped` → `delivered` → `closed` (+ `cancelled`).

- Staff prices each line (supplier cost, sell price, lead time).
- Customer sees sell prices after `quoted`, then can add a PO number and PDF.
- Staff enters tracking at `shipped`. Customer sees it on the quote page.
- Chatter-like activity feed with in-app unread (email later).

Machine-page **Request quote** still creates `status=requested` with tray quantities. Extends T2.0 explode / isolate / tray.

## What this pass is not

No email gateway, payments, Total ETO live pull, AR, Yonder, public marketing, or go-live.

## SolidWorks add-in (staff publish)

Staff can publish an assembly from SolidWorks instead of building a GLB + CSV by hand.

Source: [`solidworks-addin/`](solidworks-addin/). Click **Upload** in the Task Pane → oee360 creates the machine pack → staff assigns customer and site on the machine page.

Windows + SOLIDWORKS + Visual Studio 2022. See [`solidworks-addin/README.md`](solidworks-addin/README.md). Soft Launch web upload stays available.

## PartPicker (Drew)

Import from `src/components/viewer`. Full contract: [`src/components/viewer/README.md`](src/components/viewer/README.md).

```ts
import { PartPicker } from "@/components/viewer";

<PartPicker
  src={`/api/machines/${id}/file`}
  parts={joinedParts}
  selectedId={selectedId}
  onSelect={(part) => {
    /* { id, name, meshName, qty } or null */
  }}
/>
```

- Pass `src` as the same-origin path `/api/machines/:id/file`. Do **not** pre-fetch the GLB into a blob URL. PartPicker’s loader sends the login cookie on that `src`.
- Pass joined `parts` only. Customer pick is joined named parts only. Unmatched is a staff panel, not the picker.
- Client-only (`dynamic(..., { ssr: false })`).

Private developer check (not a customer/staff/login route): [http://localhost:3000/dev/viewer](http://localhost:3000/dev/viewer) (hardware CAD pack) or [http://localhost:3000/dev/viewer?pack=palletizer](http://localhost:3000/dev/viewer?pack=palletizer) (T1.1 placeholder).

## Sample packs (staff upload)

Upload a GLB plus CSV/JSON together as one pack. Catalog join key is **part number**. Total ETO-shaped BOM (`qty` on every row).

### Palletizer placeholder (T1.1)

Boxy primitive conveyor — do not replace this file. Fake part numbers.

| File | Role |
| --- | --- |
| [`public/placeholders/palletizer-placeholder.glb`](public/placeholders/palletizer-placeholder.glb) | Multi-part GLB. Node and mesh names **are the part numbers**. |
| [`public/placeholders/palletizer-parts.csv`](public/placeholders/palletizer-parts.csv) | Columns `partNumber`, `name`, `meshName`, `qty`. |
| [`public/placeholders/palletizer-parts.json`](public/placeholders/palletizer-parts.json) | Same rows as JSON. |

```bash
npm run generate:placeholder
```

| Part number | Name | qty | Join |
| --- | --- | --- | --- |
| `PN-FRAME-1000` | Frame weldment | 1 | Joined, clickable |
| `PN-ROLL-2104` | Drive roller | 2 | Joined, clickable |
| `PN-MTR-3301` | Gearmotor | 1 | Joined, clickable |
| `PN-BELT-4402` | Conveyor belt | 1 | List-only unmatched (no mesh) |
| `PN-GRD-5503` | Safety guard | — | Model-only unmatched (mesh, no BOM row) |

### Hardware CAD pack (real public geometry)

Public ISO / vendor CAD labeled with **McMaster-Carr catalog numbers** as mesh names and `partNumber`. Not Kevin’s machine. McMaster native CAD was login-gated; GrabCAD was blocked — see [`public/placeholders/hardware/SOURCES.md`](public/placeholders/hardware/SOURCES.md).

| File | Role |
| --- | --- |
| [`public/placeholders/hardware/mcmaster-hardware.glb`](public/placeholders/hardware/mcmaster-hardware.glb) | Five separate named meshes. Node and mesh names **are the catalog numbers**. |
| [`public/placeholders/hardware/mcmaster-hardware-parts.csv`](public/placeholders/hardware/mcmaster-hardware-parts.csv) | Columns `partNumber`, `name`, `meshName`, `qty`. |
| [`public/placeholders/hardware/mcmaster-hardware-parts.json`](public/placeholders/hardware/mcmaster-hardware-parts.json) | Same rows as JSON. |

```bash
npm run generate:hardware
```

| Part number | Name | qty | Join |
| --- | --- | --- | --- |
| `5972K325` | Shielded ball bearing, 8 mm ID × 22 mm OD × 7 mm W | 1 | Joined, clickable |
| `91280A340` | Hex head cap screw, M6 × 25 mm, 18-8 SS | 4 | Joined, clickable |
| `91828A230` | Hex nut, M6, 18-8 SS | 4 | Joined, clickable |
| `6435K12` | Set-screw shaft collar, 8 mm bore | 1 | Joined, clickable |
| `6331K32` | Miniature DC motor | 1 | Joined, clickable |
| `93475A240` | Flat washer, M6 | 10 | List-only unmatched (no mesh) |

## Private-preview seeds (Quinn)

There is **no public signup**. Staff create customer accounts. These two users are **private-preview credentials only** — not production accounts. They are seeded only when `SPARES_ALLOW_SEED=true` (Preview) or during local `npm run dev`. **Do not show these passwords on the login screen.**

| Role | Email | Password |
| --- | --- | --- |
| staff | `staff@spares.local` | `SparesStaff1!` |
| customer | `customer@spares.local` | `SparesCustomer1!` |

**Quinn — quote ConversationSheet smoke (Preview):** With `SPARES_ALLOW_SEED=true`, sign in as **staff**, open **`/staff/quotes`** (auto-seeds one idempotent QA quote), or `POST /api/staff/quotes/preview-fixture` with the session cookie. Open quote id **`quote-preview-qa-conversation`** on the host tenant. Fixture note text marks it as QA-only; Production never seeds (`SPARES_ALLOW_SEED` off).

On **Vercel Production**, leave `SPARES_ALLOW_SEED` unset; demo accounts cannot sign in even if `db.json` was copied from Preview. See [docs/soft-launch-security.md](docs/soft-launch-security.md) and [docs/soft-launch-backup.md](docs/soft-launch-backup.md) (ops backup for Blob + Care + R2).

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign in from `/login`. Preview seeds are not shown on the login screen.

```bash
npm run lint
npm run build
```

Optional (from T1.2, plus T3 durable store):

- `AUTH_SECRET` — signs the httpOnly session cookie. **Required on Vercel** (Preview and Production). A local-only development default is used when unset off Vercel. Never commit this value.
- **Microsoft Entra ID (Sign in with Microsoft)** — optional until go-live. When all three are set, the login screen shows **Sign in with Microsoft** and keeps email/password sign-in.
  - `AZURE_AD_CLIENT_ID` — Application (client) ID from the Entra app registration.
  - `AZURE_AD_CLIENT_SECRET` — client secret (Certificates & secrets).
  - `AZURE_AD_TENANT_ID` — tenant GUID for single-tenant, or `organizations` (default) for any work/school account, or `common` for work/school and personal Microsoft accounts. OAuth redirect URI (add each host you use): `{origin}/api/auth/microsoft/callback` — e.g. `https://oee360.com/api/auth/microsoft/callback`, `https://www.oee360.com/api/auth/microsoft/callback`, `https://spares-yonder3.vercel.app/api/auth/microsoft/callback`, and `http://localhost:3000/api/auth/microsoft/callback` for local dev. API permissions: Microsoft Graph delegated `openid`, `profile`, `email`, `User.Read`. Existing users are matched by email (case-insensitive); unknown emails see “Ask your admin for access” (no public signup).
- `BLOB_READ_WRITE_TOKEN` — **required on Vercel** (Preview and Production). Quotes, users, machine metadata, PO PDFs, and bug screenshots live in a private Vercel Blob store (`spares/db.json` + `spares/care.json`). The app fails closed on Vercel without this — no silent `/tmp` fallback. A failed or unreadable catalog read is raised as an error instead of being replaced with fresh fixtures, so logins are never silently reseeded away. **Back up** JSON and small files before risky promotes — [docs/soft-launch-backup.md](docs/soft-launch-backup.md). Local `npm run dev` does not need this; it keeps using `./data`.
- `SPARES_BLOB_NAMESPACE` — optional. Preview deployments and Soft Launch share one Blob store, so a Preview smoke can write into Soft Launch data. Set this (e.g. `preview-qa`) on a deployment to move its catalog to `spares/<namespace>/db.json` + `care.json`. Unset keeps the shared historical paths — see [docs/soft-launch-security.md](docs/soft-launch-security.md).
- `SPARES_OWNER_EMAIL` — on boot, upserts a **staff** user for this email (e.g. `kevin@huzevka.com`). Pair with `SPARES_OWNER_PASSWORD`; the password is never stored in the repo. Also treated as a **platform owner** unless overridden below.
- `SPARES_OWNER_PASSWORD` — sets/resets the owner staff password hash on each deploy when paired with `SPARES_OWNER_EMAIL`.
- `SPARES_PLATFORM_OWNER_EMAILS` — comma-separated emails that may create host-company tenants via `/staff/tenants` or `POST /api/platform/tenants`. Defaults to `SPARES_OWNER_EMAIL` or `kevin@huzevka.com`.
- `SPARES_CROSS_TENANT_STAFF_ADMIN_EMAILS` — comma-separated emails that may assign staff logins to a company other than their own via `POST /api/staff/team`. Defaults to `kevin@huzevka.com` only (does not inherit `SPARES_PLATFORM_OWNER_EMAILS`).

### Multi-tenant host companies (MVP)

Several automation companies (“hosts”) can share one OEE360 deployment. Each host’s staff, end-customer org (accounts → sites → machines), quotes, Care, and metadata are isolated by `tenantId` on the existing Blob JSON stores.

- **Soft Launch / Kevin’s data** — on first read after deploy, legacy rows are stamped into tenant **`tenant-oee360-host`** (“OEE360 Host”, slug `oee360-host`). No manual migration script.
- **Second host** — a platform owner creates a tenant (name + optional first staff login + optional SSO domain) on **Hosts** (`/staff/tenants`). That staff user signs in like today; Vercel Deployment Protection / SSO on the preview URL is unchanged.
- **Microsoft SSO by host domain** — set `shape.com` (or a comma list) on the host, then flip **Autoroute** on. Unknown Microsoft work emails at that domain are created as staff on that host. Autoroute stays **off** until you turn it on, so you can park a domain without opening first-login create. Existing logins keep the host they already have. Public inboxes (`gmail.com`, `outlook.com`, …) cannot be enrolled. Still one shared Entra app on `oee360.com` — not a per-host Microsoft tenant or custom login domain.
- **Not in this MVP** — per-tenant web domains, billing, marketplace, or a separate Entra app per host.
- `SPARES_ALLOW_SEED` — set to `true` on **Preview only** to seed demo fixtures (`SparesStaff1!`, Hardware, Palletizer, extra customers). Leave unset/false on Production.
- `SPARES_GITHUB_TOKEN` (or `BUG_REPORT_GITHUB_TOKEN`) — **required on Vercel** for in-app **Report bug** → GitHub issues in `xworldcom/spares` (`issues:write`, title prefix `[bug-report]`, labels `bug` + `needs-review`). Do not paste a cloud-agent or Actions `GITHUB_TOKEN` into Vercel. `GITHUB_TOKEN` / `GH_TOKEN` remain last-resort fallbacks. Without a token on Vercel, submit returns **503** (no silent in-app-only success).
- `BUG_REPORT_WEBHOOK_URL` (or `SPARES_BUG_REPORT_WEBHOOK_URL`) — optional JSON POST after a GitHub issue is created (e.g. Grok Bot / Quinn). Missing URL is fine; issue creation still succeeds and the server logs webhook failures only.
- `SPARES_DATA_DIR` — local-only override for the file-backed JSON + model directory (defaults to `./data`). **Do not set this on Vercel.**
- **S3-compatible object storage (preferred for GLB files)** — keeps large model binaries off Vercel origin transfer. Set all of:
  - `S3_ENDPOINT` — R2 endpoint, e.g. `https://<accountid>.r2.cloudflarestorage.com`
  - `S3_REGION` — use `auto` for Cloudflare R2
  - `S3_BUCKET` — bucket name
  - `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` — R2 API token
  - `S3_PUBLIC_BASE_URL` — optional public CDN/custom domain base for **local dev only**. On Vercel, machine models always use short-lived presigned GET URLs (or the credentialed `/file` proxy) so CAD stays private.
  - `S3_SIGNED_URL_TTL_SECONDS` — optional lifetime for presigned GET URLs in `fileUrl` (default `3600`, hard-capped at one hour). Presigned PUT tickets for staff uploads expire in 15 minutes.
  - `SPARES_CORS_ORIGINS` — optional comma-separated extra browser origins for model/manual asset CORS (e.g. a Vercel Preview hostname). Soft Launch aliases and localhost are always included.

### Kevin: Entra app for Microsoft sign-in

1. In [Microsoft Entra admin center](https://entra.microsoft.com/), open **Identity** → **Applications** → **App registrations** → **New registration**. Name it (e.g. `oee360 Spares`). Supported account types: choose multi-tenant (`organizations` / work & school) or single tenant as needed.
2. After create, copy **Application (client) ID** → Vercel `AZURE_AD_CLIENT_ID`. Copy **Directory (tenant) ID** if you want single-tenant → `AZURE_AD_TENANT_ID` (otherwise set `organizations` or `common` on Vercel).
3. **Certificates & secrets** → **New client secret** → copy value once → Vercel `AZURE_AD_CLIENT_SECRET` (Production; repeat for Preview if needed).
4. **Authentication** → **Add a platform** → **Web** → Redirect URIs (exact):
   - `https://oee360.com/api/auth/microsoft/callback`
   - `https://www.oee360.com/api/auth/microsoft/callback`
   - `https://spares-yonder3.vercel.app/api/auth/microsoft/callback`
   - `http://localhost:3000/api/auth/microsoft/callback`
5. **API permissions** → **Add a permission** → **Microsoft Graph** → **Delegated**: `openid`, `profile`, `email`, `User.Read`. Grant admin consent if your tenant requires it.
6. In the Vercel **Production** project settings, add `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, and `AZURE_AD_TENANT_ID`, then redeploy. Staff must already exist in Spares with the same email as their Microsoft account.

### CORS for model assets (Kevin)

Browser loads of presigned R2 URLs require a **fail-closed** bucket CORS policy. Spares only allows Spares deployment hosts — not arbitrary sites.

**Allowed by default**

- `https://spares-yonder3.vercel.app` (Soft Launch)
- `https://spares-liart.vercel.app` (Soft Launch)
- `http://localhost:3000` and `http://127.0.0.1:3000` (local dev)
- Any origins listed in `SPARES_CORS_ORIGINS`

**Behaviour**

- Soft Launch origins receive presigned R2 GET/PUT URLs in API responses (direct browser → R2).
- Other Spares Vercel preview hostnames (`spares-*.vercel.app`) are accepted by the app but fall back to the credentialed same-origin `/file` proxy (server streams from R2) until that preview URL is added to the bucket or `SPARES_CORS_ORIGINS`.
- Disallowed `Origin` headers on upload signing routes receive `403`.
- `S3_PUBLIC_BASE_URL` stays **off** on Vercel — signed GET only.

**Apply R2 bucket CORS** (once per bucket, or after adding preview origins):

```bash
# Dry-run the policy JSON
npm run configure:r2-cors -- --dry-run

# Apply with current S3_* credentials
npm run configure:r2-cors

# Add a one-off preview origin
npm run configure:r2-cors -- --add-origin=https://spares-git-main-xworldcom.vercel.app
```

### Tess: wire Cloudflare R2 for model files (recommended)

Large GLBs should not stream through Vercel on every view. JSON records can stay on Blob; only model binaries need R2. **Keep the bucket private** — do not enable r2.dev public access or world-readable listing for Spares critique.

1. In Cloudflare, create a **private R2 bucket** and an **API token** with read/write on that bucket.
2. In the Vercel project **Preview** environment, set:
   - `S3_ENDPOINT` = `https://<accountid>.r2.cloudflarestorage.com`
   - `S3_REGION` = `auto`
   - `S3_BUCKET` = `spares-models` (or your bucket name)
   - `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` = R2 token
   - Do **not** set `S3_PUBLIC_BASE_URL` unless you later attach a public CDN domain.
3. Keep `BLOB_READ_WRITE_TOKEN` for `spares/db.json` and small files (PO PDFs, bug screenshots) unless you move JSON elsewhere later.
4. Redeploy Preview only. Do **not** promote to Production.

On ingest, Spares compresses GLBs with meshopt + Draco before writing to R2. When S3 credentials are set, `GET /api/machines/:id` returns a **short-lived presigned GET URL** in `fileUrl` so the browser loads the GLB straight from R2 without cookies and without Vercel origin transfer. The bucket stays private. Optional `S3_PUBLIC_BASE_URL` switches to a permanent CDN URL instead. `GET /api/machines/:id/file` remains a credentialed same-origin fallback when the object is not in R2 yet (small models only — see migration below).

**After enabling S3 on Preview for the first time**, run the one-shot model backfill so machines uploaded to Vercel Blob before R2 are copied into the bucket:

1. Sign in as staff on Preview.
2. `POST /api/staff/machines/backfill-models` with your session cookie (browser devtools, or `curl` with the `spares_session` cookie).
3. Check the JSON summary: `copied` should match legacy machines; `skippedExists` on reruns is normal. Models over 40 MB are skipped with a warning — re-upload those packs manually.

Until backfill completes, the viewer falls back to Blob for small GLBs (&lt; 5 MB) via `/api/machines/:id/file`. Larger legacy models refuse to proxy through Vercel and ask staff to backfill or re-upload.

**Hard stops (no silent Vercel transfer):** When `S3_*` is set, staff uploads use presigned R2 PUT only — a failed upload ticket or S3 POST never falls back to Vercel Blob or multipart. `GET /api/machines/:id/file` redirects to R2 when the object exists; otherwise it proxies legacy Blob/fs models **only** if they are ≤ 5 MB. On Vercel Preview/Production without S3, GLBs over 5 MB are refused with a message to wire R2 (`S3_*`); local `npm run dev` without object storage may still use multipart for DX.

### Tess: attach Blob on Preview (JSON + small files)

Vercel `/tmp` is per-instance. Without Blob **or** another durable store, a quote created on one function instance disappears on the next cold start.

1. In the Vercel dashboard, open **Storage** and create a **Blob** store (private preview is fine).
2. Connect that store to the `spares` project for the **Preview** environment (Development too if you want). Vercel injects `BLOB_READ_WRITE_TOKEN` — you should not need to paste the token by hand.
3. Redeploy the Preview. Keep **Vercel Authentication / Deployment Protection / SSO on**. Do not promote to Production.
4. Confirm Preview env has `BLOB_READ_WRITE_TOKEN` and does **not** have `SPARES_DATA_DIR`.
5. `DATABASE_URL` / Upstash Redis are **not** required for this pass. JSON records are stored as a private Blob object (`spares/db.json`) alongside files (`spares/files/...`). We can move JSON to Postgres later if the preview outgrows this.

With `SPARES_ALLOW_SEED=true`, an empty Blob store auto-seeds Hardware fixture, Palletizer, and the preview users the first time an API route runs.

### Large GLB packs

Staff Upload pack sends the 3D file **straight to object storage** when configured (S3/R2 presigned PUT, or Vercel Blob when S3 is not set). The create/replace request only carries the machine name, plant, and parts list — so a ~49 MB SolidWorks export no longer dies with `Request failed (413)` at the Next/Vercel body limit. On ingest, Spares normalizes and compresses the GLB (meshopt + Draco) before the final object is stored.

| Path | What succeeds | Hard ceiling |
| --- | --- | --- |
| Preview with S3/R2 | GLB packs **up to 256 MB** via presigned upload | Presigned PUT only — no Blob/multipart fallback. |
| Preview with Blob only (`BLOB_READ_WRITE_TOKEN`, no S3) | GLB packs **up to 5 MB** via Blob client upload | Larger files are refused — wire R2 (`S3_*`) instead of streaming 50–200 MB through Vercel. |
| Local `npm run dev` without object storage | Multipart through the API | Next/Vercel practical cap **100 MB** (`proxyClientMaxBodySize`). |
| Over 15 MB without successful compression | Upload is refused before save | “Could not be compressed enough for storage…” — re-export with Draco/meshopt or simplify. |
| Over the ceiling | Upload is refused before join | “This model is N MB. Staff packs can be up to 256 MB.” |

256 MB is a Vercel-practical ceiling: the join step still reads the stored GLB in the function to extract mesh names.

When S3 is configured, the 3D viewer loads the model from the presigned `fileUrl` (or the optional CDN URL when `S3_PUBLIC_BASE_URL` is set). Without S3, it uses `GET /api/machines/:id/file` (session cookie). Very large assemblies may be slow to open even after a successful upload.

## API (T1.2, stacked from #7)

The UI calls these routes with `credentials: "include"`:

- `POST /api/auth/login` JSON `{ email, password }` → `{ user }`
- `POST /api/auth/logout`
- `GET /api/auth/me` → `{ user }`
- `POST /api/staff/customers` — staff creates customer people (email/password + site/machine access)
- `POST /api/staff/team` — staff (or platform owner with `tenantId`) creates staff logins for the host or a satellite company
- `POST /api/machines` — staff pack create. On Preview (Blob attached) the GLB is uploaded client → private Blob, then this route receives `name`, `partsList`, `storedFileName`, and optional `siteId`. Multipart `model` is the local fallback.
- `POST /api/machines/model-upload` — staff-only Vercel Blob client-token endpoint for the GLB
- `POST /api/machines/:id/pack` — same pack payload as create, replaces the model + join
- `GET /api/machines` → `{ machines: [{ id, name }] }`
- `GET /api/machines/:id` → `{ id, name, fileUrl, parts: [{ id, name, meshName, qty }], unmatched?: [...] }` (`fileUrl` is a presigned R2 URL when the object exists in S3, or same-origin `/file` during Blob→R2 migration)
- `GET /api/machines/:id/file` — session cookie required; same-origin fallback when the GLB is not in R2 yet (small models only; large legacy files return a plain-English error)
- `POST /api/staff/machines/backfill-models` — staff-only one-shot copy of legacy Blob/fs GLBs into R2 (idempotent; skips files over 40 MB)
- `POST /api/quotes` — customer `{ machineId, items: [{ id, qty, name? }], note? }` (`qty` ≥ 1). Creates `status=requested`.
- `GET /api/quotes` — staff sees all; customer sees own. Includes `unread` and `unreadCount`.
- `GET /api/quotes/:id` — role-aware detail; marks the quote read for the current user. `:id` may be the sequential number.
- `PATCH /api/quotes/:id` — staff: status, line pricing (`sellPrice`, `supplierCost`, `leadTimeDays`, `supplier`), tracking. Customer: PO number after quoted. Shipped requires a tracking number.
- `POST /api/quotes/:id/activity` — message on the shared feed.
- `POST /api/quotes/:id/po` — customer multipart PDF + optional `poNumber` after quoted. `GET` downloads the PDF.
- Customer GET of a machine still omits `unmatched`.

Customer GET **omits `unmatched` entirely**. Staff sees `unmatched`. Catalog source of truth is Total ETO. Join key is part number.

## Repository layout

| Path | Work |
| --- | --- |
| `src/app` | App Router pages and layouts (Fern) |
| `src/app/api` | Backend Route Handlers (T1.2 from #7, stacked) |
| `src/app/dev/viewer` | Private developer check for sample packs (Drew; `?pack=palletizer` for T1.1) |
| `src/components/viewer` | `PartPicker` (Drew: rotate/zoom/pan/highlight + cookie loader) |
| `public/placeholders` | Sample packs: palletizer placeholder + hardware CAD (Drew) |
| `src/components` | Layout, nav, BOM, quote form, staff forms (Fern) |
| `src/lib/api` | Typed API clients (Fern) |
| `src/lib/auth` | Authentication helpers (T1.2) |
| `src/types` | Shared TypeScript types |

## Do not go live

Keep this GitHub repository private. Preview or local development is fine; production and a custom domain are not part of T3.0. Keep Vercel SSO on. Do not promote this preview to production.
