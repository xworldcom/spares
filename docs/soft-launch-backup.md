# Soft Launch backup (ops)

Soft Launch stays **private** (Vercel Deployment Protection / SSO on). This note is for **Kevin and Tess** only — it does not change app behavior. It closes the backup item from the [#85](https://github.com/xworldcom/spares/issues/85) checklist. Security controls live in [soft-launch-security.md](./soft-launch-security.md).

## What to back up

Spares splits durable data across **Vercel Blob** (JSON + small files) and **Cloudflare R2** (large binaries). Back up both; restoring only one side leaves broken links (e.g. tickets referencing missing `r2Key` values).

### 1. Vercel Blob — catalog JSON (`spares/db.json`)

Single JSON document. On Vercel it holds the main app database, including (all scoped by `tenantId` where applicable):

- Host tenants and org tree (customer accounts, sites)
- Users (password hashes, roles, tenant assignment)
- Machines and parts catalog metadata (not the GLB bytes when R2 is wired)
- Quotes, line items, status, quote activity feed, PO metadata
- Bug report records (screenshots may point at Blob files under `spares/files/`)
- Machine view / analytics-style counters stored with the catalog

Paths are defined in `src/lib/blob-paths.ts` (`blobDbPath()`). When an environment sets `SPARES_BLOB_NAMESPACE`, its catalog lives at `spares/<namespace>/db.json` and `spares/<namespace>/care.json` instead — back up the namespaced pair for that environment. Unset means the historical `spares/db.json` / `spares/care.json`.

### 2. Vercel Blob — Care sidecar (`spares/care.json`)

Separate object so catalog “heal” passes cannot wipe Care. Contains:

- **Manuals** — metadata (machine, title, stored file name); PDF bytes live in R2 under `manuals/` when S3/R2 is configured
- **Service tickets** — status, messages, **activity threads**, read receipts
- **Attachment metadata** on tickets and quote chatter (`r2Key`, file name, MIME) — binaries are **not** in this JSON
- **Machine usage** — hours/cycles, notes, usage history

On every write the app mirrors Care into both `db.json` and `care.json`, but **`care.json` is the authoritative merge target** when the two diverge. Always back up **both** JSON files together.

### 3. Vercel Blob — small files (`spares/files/…`)

Prefix `spares/files/` (see `BLOB_FILES_PREFIX`). Typical contents:

- PO PDFs uploaded on quotes
- Bug report screenshots
- Legacy or fallback **small** GLBs (≤ ~5 MB) when not yet in R2

When R2 is enabled, new machine packs should land in R2, not here — but older Preview data may still have GLBs in Blob until backfill.

### 4. Cloudflare R2 — binaries (separate from Blob)

Configured via Vercel `S3_*` env vars (`S3_BUCKET`, etc.). The bucket stays **private**; the app uses presigned URLs. Back up the **whole bucket** (or at least these prefixes):

| Prefix | Contents |
| --- | --- |
| `models/` | Machine GLB packs (compressed on ingest) |
| `manuals/` | Care manual PDFs |
| `chat/` | Chat / ticket / quote attachment images and files |

R2 is **not** included in Vercel Blob exports. Treat it as its own backup job.

## How to back up

### Blob (JSON + `spares/files/`)

1. **Vercel dashboard** — Project → **Storage** → connected Blob store → browse objects and download `spares/db.json`, `spares/care.json`, and any important objects under `spares/files/`.
2. **CLI / script (recommended for repeatability)** — From a secure machine, with the environment’s `BLOB_READ_WRITE_TOKEN` (Preview token for Soft Launch data; do not commit tokens):
   - Pull JSON: use `@vercel/blob` `get()` for `spares/db.json` and `spares/care.json` (same paths the app uses in `src/lib/persistence.ts`).
   - List and download `spares/files/*` if you need PO PDFs, screenshots, or legacy GLBs.
3. Store snapshots in a **private** location (1Password vault file, encrypted drive, or private S3/R2 bucket used only for backups). Name files with **environment + date** (e.g. `preview-2026-09-15-db.json`).

### R2 (models, manuals, chat media)

1. **Cloudflare dashboard** — R2 → bucket → browse or use **R2 data migration** / export tools as Cloudflare documents for your account.
2. **S3-compatible sync** — With the same API token as production Preview (`S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`):

   ```bash
   aws s3 sync "s3://YOUR_BUCKET" "./spares-r2-backup-YYYY-MM-DD" --endpoint-url "https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com"
   ```

   (Install AWS CLI v2; region can be `auto` for R2.)

Verify restores in a **non-production** copy of the environment before relying on a snapshot.

## What is **not** backed up automatically

Vercel and Cloudflare do **not** give Spares point-in-time restore for this stack unless you snapshot yourself.

| Item | Notes |
| --- | --- |
| **This backup process** | No scheduled job in the repo; snapshots are manual unless you add automation later. |
| **Vercel env vars** | `AUTH_SECRET`, `BLOB_READ_WRITE_TOKEN`, `S3_*`, `AZURE_AD_*`, `SPARES_OWNER_*`, GitHub PATs, etc. — export from Vercel **Settings → Environment Variables** into your secrets store. |
| **Deployment Protection / SSO** | Vercel project settings; not in Blob/R2. |
| **Entra app registration** | Client secret and redirect URIs live in Microsoft Entra + Vercel. |
| **R2 CORS policy** | Recreate from repo: `npm run configure:r2-cors` (see README). |
| **Active login sessions** | Session cookies are ephemeral; users sign in again after restore. |
| **GitHub issues** | Staff bug reports may create GitHub issues via PAT — issue bodies are in GitHub, not Blob. |
| **Application source** | GitHub `xworldcom/spares`; unrelated to customer/quote data restores. |

## Suggested cadence and owners

| When | Action | Who |
| --- | --- | --- |
| **Before** promoting Preview → Production, cloning the Blob store, or bulk migration/backfill | Full Blob JSON + `spares/files/` + R2 sync | **Kevin** (go/no-go) + **Tess** (Blob/R2 execution) |
| **After** major Soft Launch demos or multi-tenant onboarding | Same-day snapshot if new machines/quotes/Care tickets were created | **Tess** |
| **Monthly** during active pilot | Blob JSON pair + spot-check R2 sync | **Tess** |
| **Env / secret rotation** | Re-export Vercel env + document rotation date | **Kevin** |

If Preview and Production ever use **different** Blob stores or buckets, label backups clearly — restoring Preview tokens against Production storage will corrupt the wrong environment.

## When a restore is the right answer

The app refuses to overwrite a catalog it cannot read: a failed Blob read raises `PersistenceReadError` and unreadable JSON raises `CatalogUnreadableError`, so requests fail loudly instead of silently rewriting `db.json` with demo fixtures. If the app starts reporting either error, the stored document is still there — restore the most recent `db.json` + `care.json` pair rather than redeploying and hoping.

## Restore (high level)

1. Restore R2 objects first (or attachment links break).
2. Upload `spares/care.json` and `spares/db.json` to the **correct** Blob store (overwrite only after confirming environment).
3. Restore `spares/files/` objects if PO PDFs or legacy GLBs are missing.
4. Redeploy or cold-start a function and smoke-test: login, one machine `fileUrl`, one quote, one Care ticket with attachment.

Do **not** turn off Vercel Deployment Protection or publish Soft Launch to test restores; use a dedicated Preview deployment or local `SPARES_DATA_DIR` with copied files.

## Related docs

- [README.md](../README.md) — Blob, R2, and env var setup
- [soft-launch-security.md](./soft-launch-security.md) — in-repo security checklist ([#69](https://github.com/xworldcom/spares/issues/69), [#85](https://github.com/xworldcom/spares/issues/85))
