# Spares

Spares is a private industrial spare-parts platform.

Internal staff upload a machine pack. Customers log in, inspect and rotate a machine in the browser, pick a named part, and request a quote.

This repository is **private by default**. The product is **not live**. Do not deploy this app to a public production URL, attach a public custom domain, or turn on public signup.

## What this pass is (T1.3)

This pull request is the **web UI** (PR #8). It is stacked on the T1.2 draft APIs from [PR #7](https://github.com/xworldcom/spares/pull/7) (`cursor/t1-2-auth-pack-quotes-fcd6`) so the routes exist to call. **PR #7 is not merged to `main`.** Do not treat it as landed on `main`, and do not merge #7 from this UI PR.

- Cookie-session login for staff and customers (`POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`)
- Role-aware nav after `/api/auth/me`
- Staff: create customer accounts; upload a pack (machine name + GLB/GLTF + ETO-shaped parts list with part number, name, qty); see unmatched meshes
- Customer: open that machine; chrome around Drew’s `PartPicker`; selected part shows name and part number; request a quote with an optional note
- Empty, error, and not-signed-in states
- Qty on each parts-list row so it reads like an ETO BOM

Drew’s picker is imported as `PartPicker` from `src/components/viewer` with props `src`, `parts`, and `onSelect`. If that implementation is not on this branch yet, a typed mount slot keeps those exact props. This PR does **not** stub a second 3D engine or invent a second item master.

## What this pass is not

No buy/cart/checkout UI, public marketing, self-serve signup, payments, SolidWorks converter, or go-live.

## Private-preview seeds (Quinn)

There is **no public signup**. Staff create customer accounts. These two users are **private-preview credentials only** — not production accounts. They are seeded automatically the first time the API store is created. **Do not show these passwords on the login screen.**

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

Open [http://localhost:3000](http://localhost:3000). Sign in from `/login`. Preview seeds are not shown on the login screen.

```bash
npm run lint
npm run build
```

Optional (from T1.2):

- `AUTH_SECRET` — signs the httpOnly session cookie. A local non-production default is used when unset.
- `SPARES_DATA_DIR` — override the file-backed JSON + model directory (defaults to `./data` locally, `/tmp/spares-data` on Vercel).

On a protected Vercel preview the 3D file URL is same-origin (`/api/machines/:id/file`) and requires the session cookie (`credentials: "include"`). That path is the `src` passed to `PartPicker`, not a public blob URL. Preview storage is ephemeral; local `data/` is gitignored. Do not attach a production project or custom domain.

## API (T1.2, stacked from #7)

The UI calls these routes with `credentials: "include"`:

- `POST /api/auth/login` JSON `{ email, password }` → `{ user: { id, email, role } }`
- `POST /api/auth/logout`
- `GET /api/auth/me` → `{ user: { id, email, role } }`
- `POST /api/staff/customers` JSON `{ email, password }` — staff only; creates a customer

There is no public `/api/auth/register` route.

Machines:

- `POST /api/machines` — staff, multipart/form-data: `name`, `model` (`.glb` / `.gltf`), `partsList` (CSV headers `partNumber,name,meshName,qty` or a JSON array of the same). Missing `qty` defaults to `1`.
- `GET /api/machines` → `{ machines: [{ id, name }] }` (any signed-in user)
- `GET /api/machines/:id` → `{ id, name, fileUrl, parts: [{ id, name, meshName, qty }], unmatched?: [...] }`
- `GET /api/machines/:id/file` — session cookie required; this is the viewer `src`

Join rule: `parts[].id` is the part number. Every joined part includes `qty`. A row is customer-pickable only when the list row and a 3D mesh can be paired. `PartPicker` receives **joined `parts` only**. Unmatched list rows and unused meshes are returned in `unmatched` for **staff**. Customer GET **omits the `unmatched` field entirely** (not `unmatched: []`). Customers never receive unmatched rows as pickable parts. Staff unmatched is a separate staff panel, not the picker.

Quotes:

- `POST /api/quotes` — customer JSON `{ machineId, partIds: string[], note?: string }`
- `GET /api/quotes` — staff inbox, newest first. No email notifications.

Unauthenticated calls return **401**. Wrong-role calls return **403**.

Catalog source of truth is Total ETO (item master + job BOM). Join key is part number. Ticket 1 uses a fake ETO-shaped parts list.

## Viewer contract (Drew)

```ts
import { PartPicker } from "@/components/viewer";

<PartPicker
  src="/api/machines/:id/file" // cookie session, credentials: "include"
  parts={joinedParts}          // { id, name, meshName, qty }[]
  onSelect={(part) => { /* { id, name, meshName, qty } */ }}
/>
```

Drew owns rotate / zoom / pan / highlight. Fern owns chrome, the selected-part name, and the quote form.

## Repository layout

| Path | Work |
| --- | --- |
| `src/app` | App Router pages and layouts |
| `src/app/api` | Backend Route Handlers (T1.2 from #7, stacked) |
| `src/components/viewer` | `PartPicker` (Drew: rotate/zoom/pan/highlight) |
| `src/components` | Layout, nav, BOM, quote form, staff forms |
| `src/lib/api` | Typed API clients |
| `src/lib/auth` | Authentication helpers (T1.2) |
| `src/types` | Shared TypeScript types |

## Do not go live

Keep this GitHub repository private. Preview or local development is fine; production and a custom domain are not part of T1.3.
