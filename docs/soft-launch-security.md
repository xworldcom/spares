# Soft Launch security checklist (code)

Soft Launch stays **SSO / Vercel Deployment Protection ON**. This document tracks in-repo controls for issues [#69](https://github.com/xworldcom/spares/issues/69) and [#85](https://github.com/xworldcom/spares/issues/85).

## Demo seeds (`SPARES_ALLOW_SEED`)

| Environment | `SPARES_ALLOW_SEED` | Demo users (`staff@spares.local`, `customer@spares.local`, …) |
|-------------|---------------------|----------------------------------------------------------------|
| **Production** (Vercel) | **Must be unset** or `false` | Catalog heal does not seed fixtures; **password login is rejected** even if a Preview copy of `db.json` still lists demo users. |
| **Preview** (Vercel) | `true` (Kevin / Tess only) | Demo fixtures and passwords work for QA. |
| **Local** (`npm run dev`) | Optional; defaults to allowed off-Vercel | Same as Preview for developer convenience. |

Implementation:

- `isSeedAllowed()` — `src/lib/production-env.ts`
- Login gate — `isDemoSeedLoginBlocked()` — `src/lib/demo-seed-gate.ts`
- Owner staff on Production — `SPARES_OWNER_EMAIL` / `SPARES_OWNER_PASSWORD` (real accounts, not `@spares.local`)

**Kevin-only:** turning on `SPARES_ALLOW_SEED` on Production would re-enable demo data and logins. Do not set it on the Production environment in Vercel.

While seeds are on, catalog heal keeps `staff@spares.local` and `customer@spares.local` present (re-added when absent, un-deactivated when a stored row was soft-deleted) and the platform refuses to deactivate or rename them. The heal only ever touches those two addresses — real staff and customer logins are never added, edited, or removed by it, and are never resurrected after a deliberate deactivate.

## Durable catalog: logins must not disappear

`db.json` holds every login, so the store treats it as authoritative rather than disposable:

- A catalog read that fails (Blob rate limit, dropped socket, expired token) is retried and then raised as `PersistenceReadError`. It is **never** treated as "no catalog yet" — that used to reseed fixtures over every user, machine, and quote.
- Unparseable catalog JSON raises `CatalogUnreadableError` instead of being overwritten, so the document stays restorable from [soft-launch-backup.md](./soft-launch-backup.md).
- A catalog with **zero** users is valid (seeds off, no owner yet) and is healed in place instead of reseeded.
- Every write merges users, host tenants, customer accounts, sites, and org tombstones against the latest stored copy. A concurrent request — another instance, or a Preview smoke sharing the same Blob store — can no longer drop people created since it read. Soft deletes still win, so a stale writer cannot resurrect a removed person.
- Creating a login, or renaming one, loses to a concurrent writer that already used the address. Two live rows for one email make sign-in ambiguous and `findUserByEmail` fails closed for both people.
- Renaming a host (e.g. **OEE360 Host** → **JMP**) only changes the tenant's display name. Staff and customer rows stay bound to the tenant **id** (`tenant-oee360-host`), so sessions, `staffCreatedTenantId` pins, and Directory rows follow the rename instead of orphaning.

### `SPARES_BLOB_NAMESPACE` (Preview vs Soft Launch isolation)

Preview deployments and Soft Launch share `BLOB_READ_WRITE_TOKEN`, so a Preview QA smoke that renames a host or deactivates a login writes straight into Soft Launch data (this is how the Soft Launch host showed up renamed on Preview). Set `SPARES_BLOB_NAMESPACE` on the deployments that must stay isolated — `SPARES_BLOB_NAMESPACE=preview-qa` reads and writes `spares/preview-qa/db.json` and `spares/preview-qa/care.json`. Leaving it unset keeps the historical `spares/db.json` paths, so **Soft Launch needs no data migration**; only give the namespace to the environment you want to fork off, and back both up first.

## Auth and sessions

- Session cookie `spares_session`: `HttpOnly`, `Secure` on Vercel, `SameSite=Lax` — `src/lib/auth/session-token.ts`
- `AUTH_SECRET` required on Vercel; local default secret is refused when `VERCEL` is set — same module + `assertManagedRuntimeEnv()` in `src/instrumentation.ts`
- Login rate limit: 8 attempts / 15 minutes per IP and per email — `src/lib/rate-limit.ts`, `src/app/api/auth/login/route.ts`
- No public signup; staff create **customer** logins under `POST /api/staff/customers` (People UI) and **staff** logins under `POST /api/staff/team` (Team UI). Demo `@spares.local` addresses cannot be created when seeds are off.
- Cross-tenant staff create (`tenantId` ≠ actor’s company) is limited to `SPARES_CROSS_TENANT_STAFF_ADMIN_EMAILS` (defaults to `kevin@huzevka.com`). This is **separate from** `SPARES_PLATFORM_OWNER_EMAILS` (tenant admin UI). **`SPARES_OWNER_EMAIL` alone does not grant cross-tenant staff create** (Preview QA staff can stay bootstrap-only). The bootstrap owner address is stripped from the cross-tenant allowlist when listed explicitly.
- Host-company staff created on `tenant-oee360-host` must keep that tenant through catalog heal/login. Staff rows store immutable `staffCreatedTenantId` at create time; login and APIs use that pin for non–cross-tenant admins so heals cannot drift scope to an empty satellite. Only satellite tenants’ bootstrap staff emails (set when the company is created) are repaired off the host tenant. Catalog heals merge against the latest blob write. Soft Launch seed machines (`hardware-fixture`, `palletizer`) are re-pinned to the host tenant when seeds are allowed.
- Passwords must not appear in URLs; client strips credential query keys — `src/lib/auth/safe-url.ts`

## APIs and roles

- Mutating staff routes use `requireTenantStaff` / `requireRole("staff")`
- Customer quote **POST** requires `requireTenantCustomer` (no anonymous quotes)
- Machine file proxy and manuals require authenticated tenant users; model **upload** is staff-only
- Bug report POST ignores client-supplied identity (session only)

## Object storage (R2 / S3)

- Presigned GET TTL default 1h, hard-capped at 1h — `src/lib/s3-config.ts`
- Presigned PUT (staff uploads) TTL 15 minutes
- Bucket CORS is allowlist-only (not `*`); apply with `npm run configure:r2-cors` — `scripts/configure-r2-cors.mjs`, `src/lib/cors.ts`

## HTTP headers

Baseline security headers on all routes — `next.config.ts` (`X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`).

## Out of scope (tracked elsewhere)

- Microsoft Entra / SSO env (`AZURE_AD_*`) — [#119](https://github.com/xworldcom/spares/issues/119)
- Disabling Vercel Deployment Protection or public go-live
- Periodic `AUTH_SECRET` rotation (ops)
- **Blob / Care / R2 backups** — manual ops cadence — [soft-launch-backup.md](./soft-launch-backup.md)
