# Staff directory and platform hosts

Directory and platform routes let staff browse people in the tenant and let platform owners manage host companies on `/staff/directory` and `/staff/tenants` (API: `/api/platform/tenants`).

## Sub-features

- `directory-list` — `/staff/directory` unified table (tabs: All | Hosts | Staff | Customers | People).
- `directory-search` — search input on every tab (`#directory-search`, placeholder “Search name, email, or host”).
- `directory-create-chips` — subtle rounded chips beside search on the matching tab only (not on All): Hosts → link **New Host** → `/staff/tenants`; Customers / Staff / People → toggle create panels.
- `directory-profile` — `/staff/directory/[userId]` profile view (staff and people rows).
- `directory-host-row` — host row opens `/staff/platform/[tenantId]`; customer row → `/staff/accounts/[id]`.
- `platform-tenants` — `/staff/tenants` new host form (platform owner).
- `platform-create-tenant` — create satellite host (mutating; local only by default).

## How to get to it (user POV)

- Staff: **Directory** in nav.
- Platform owner: **Hosts** / **Tenants** (`/staff/tenants`).

## Driving it with control-oee360

Preconditions:

- Staff session; platform routes additionally require platform owner email (`SPARES_PLATFORM_OWNER_EMAILS` / owner bootstrap).

- **Directory page.** With session cookie, open `/staff/directory` in browser or fetch HTML with cookie. Expect heading **Directory**, type tabs in order All → Hosts → Staff → Customers → People, and `#directory-search` on each tab.
- **Platform list (read-only).** Platform owner: `GET /api/platform/tenants` with cookie → `{ tenants: [...] }`.
- **Proof.** Screenshot or JSON listing under `evidence/<run-id>/directory/`; no tenant creation on Soft Launch unless approved.

## Gotchas

- Soft Launch data lives in tenant `tenant-oee360-host`; satellite tenants are separate.
- Cross-tenant staff assignment is limited to `SPARES_CROSS_TENANT_STAFF_ADMIN_EMAILS`.
- Creating tenants mutates Blob; keep to local `SPARES_DATA_DIR` for prove-it.
