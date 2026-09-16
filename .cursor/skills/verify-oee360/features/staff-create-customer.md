# Staff create customer login

Staff create customer lets host staff add a customer person with email, password, and site/machine access via **People** (`/staff/people`) and `POST /api/staff/customers`.

## Sub-features

- `people-ui` — form on `/staff/people`.
- `customers-api` — JSON create with tenant scope.
- `customers-access` — new user can sign in and see assigned machines.

## How to get to it (user POV)

- Staff → **People** → fill email, password, account/site fields → submit.

## Driving it with control-oee360

Preconditions:

- Staff session on **local disposable** `SPARES_DATA_DIR` only.
- Use a unique email such as `verify-customer+<run-id>@example.test`.

- **Create via API.** `POST /api/staff/customers` with cookie and JSON body per API docs. Expect `201` and public user shape without password hash.
- **Sign in as new customer.** `api login` with the new credentials → `role` `customer`.
- **Cleanup user.** Remove or ignore test user in disposable store; do not run against Production Blob.

## Gotchas

- Demo `@spares.local` addresses cannot be created when seeds are off.
- Mutations persist in Blob on Preview/Production; default prove-it stays local.
- Rate limits and validation errors return 4xx with plain messages.
