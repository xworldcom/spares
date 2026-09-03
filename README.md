# Spares

Spares is a private industrial spare-parts platform.

Internal staff will upload 3D models derived from SolidWorks. Customers will log in, inspect and rotate a machine in the browser, pick a part, and request a quote.

This repository is **private by default**. The product is **not live**. Do not deploy this app to a public production URL, attach a public custom domain, or turn on public signup.

## What this pass is (T1.2)

This pull request stacks **backend-only** auth, pack upload, and quote-request APIs on the T1.0 Next.js App Router scaffold. There is still no staff/customer UI (Fern) and no 3D viewer (Drew).

It does **not** include Stripe/checkout, public registration, a native SolidWorks parser, anti-scam checks, a cart, a public marketing site, or a production deploy.

## Private-preview seeds (Quinn)

There is **no public signup**. Staff create customer accounts. These two users are **private-preview credentials only** — not production accounts. They are seeded automatically the first time the API store is created:

| Role | Email | Password |
| --- | --- | --- |
| staff | `staff@spares.local` | `SparesStaff1!` |
| customer | `customer@spares.local` | `SparesCustomer1!` |

`GET /api/auth/me` returns `{ user: { id, email, role } }` after login.

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You should see a page stating the app is private and not live.

```bash
npm run lint
npm run build
```

Optional:

- `AUTH_SECRET` — signs the httpOnly session cookie. A local non-production default is used when unset.
- `SPARES_DATA_DIR` — override the file-backed JSON + model directory (defaults to `./data` locally, `/tmp/spares-data` on Vercel).

On a protected Vercel preview the 3D file URL is same-origin (`/api/machines/:id/file`) and requires the session cookie. Preview storage is ephemeral (serverless filesystem); local `data/` is gitignored. Do not attach a production project or custom domain.

## API (Fern / Drew)

Auth (email + password, httpOnly `spares_session` cookie):

- `POST /api/auth/login` JSON `{ email, password }` → `{ user: { id, email, role } }`
- `POST /api/auth/logout`
- `GET /api/auth/me` → `{ user: { id, email, role } }`
- `POST /api/staff/customers` JSON `{ email, password }` — staff only; creates a customer

There is no public `/api/auth/register` route.

Machines:

- `POST /api/machines` — staff, multipart/form-data: `name`, `model` (`.glb` / `.gltf`), `partsList` (CSV headers `partNumber,name,meshName,qty` or a JSON array of the same). Missing `qty` defaults to `1`.
- `GET /api/machines` → `{ machines: [{ id, name }] }` (any signed-in user)
- `GET /api/machines/:id` → `{ id, name, fileUrl, parts: [{ id, name, meshName, qty }], unmatched?: [...] }`

Join rule: `parts[].id` is the part number. Every joined part includes `qty` (ETO BOM quantity). A row is customer-pickable only when the list row and a 3D mesh can be paired (`meshName` from the list, or a mesh whose name equals `partNumber` / `name`). Unmatched list rows and unused meshes are returned in `unmatched` for **staff** (list-side rows include `qty` when present). Customer GET **omits the `unmatched` field entirely** (not `unmatched: []`). Customers never receive unmatched rows as pickable parts.

`fileUrl` points at `GET /api/machines/:id/file` (session required) so the model can be loaded on a protected Vercel preview.

Quotes:

- `POST /api/quotes` — customer JSON `{ machineId, partIds: string[], note?: string }`
- `GET /api/quotes` — staff inbox, newest first. No email notifications.

Unauthenticated calls return **401**. Wrong-role calls return **403**.

## Repository layout

| Path | Work |
| --- | --- |
| `src/app` | App Router pages and layouts |
| `src/app/api` | Backend Route Handlers |
| `src/components/viewer` | Browser 3D viewer (later) |
| `src/lib/auth` | Authentication helpers |
| `src/types` | Shared TypeScript types |

## Do not go live

Keep this GitHub repository private. Do not publish a public site from this app. Preview or local development is fine; production and a custom domain are not part of T1.2.
