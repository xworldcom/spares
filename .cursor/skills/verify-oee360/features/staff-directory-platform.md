# Staff directory and platform hosts

Directory and platform routes let staff browse people in the tenant and let platform owners manage host companies on `/staff/directory` and `/staff/tenants` (API: `/api/platform/tenants`).

## Sub-features

- `directory-list` — `/staff/directory` people list.
- `directory-profile` — `/staff/directory/[userId]` profile view.
- `platform-tenants` — `/staff/tenants` host company list (platform owner).
- `platform-create-tenant` — create satellite host (mutating; local only by default).

## How to get to it (user POV)

- Staff: **Directory** in nav.
- Platform owner: **Hosts** / **Tenants** (`/staff/tenants`).

## Driving it with control-oee360

Preconditions:

- Staff session; platform routes additionally require platform owner email (`SPARES_PLATFORM_OWNER_EMAILS` / owner bootstrap).

- **Directory page.** With session cookie, open `/staff/directory` in browser or fetch HTML with cookie. Expect heading **Directory** or people table.
- **Platform list (read-only).** Platform owner: `GET /api/platform/tenants` with cookie → `{ tenants: [...] }`.
- **Proof.** Screenshot or JSON listing under `evidence/<run-id>/directory/`; no tenant creation on Soft Launch unless approved.

## Gotchas

- Soft Launch data lives in tenant `tenant-oee360-host`; satellite tenants are separate.
- Cross-tenant staff assignment is limited to `SPARES_CROSS_TENANT_STAFF_ADMIN_EMAILS`.
- Creating tenants mutates Blob; keep to local `SPARES_DATA_DIR` for prove-it.
