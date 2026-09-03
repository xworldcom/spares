# Spares

Spares is a private industrial spare-parts platform.

Internal staff will upload 3D models derived from SolidWorks. Customers will log in, inspect and rotate a machine in the browser, pick a part, and request a quote.

This repository is **private by default**. The product is **not live**. Do not deploy this app to a public production URL, attach a public custom domain, or turn on public signup.

## What this pass is (T1.1)

This pull request stacks Drew's **placeholder machine pack** and **browser part picker** on the **draft** T1.2 APIs ([PR #7](https://github.com/xworldcom/spares/pull/7), `cursor/t1-2-auth-pack-quotes-fcd6`). PR #7 is **not merged** to `main`. This PR does not merge it.

There is still no login / staff / customer chrome (Fern, T1.3). This PR does not duplicate Brent's auth, pack-upload, or quote API.

It does **not** include Stripe/checkout, public registration, a native SolidWorks parser, anti-scam checks, a cart, a public marketing site, or a production deploy.

The placeholder GLB *is* the product for this slice: a short palletizer / conveyor infeed with named industrial parts, not a three-cube demo.

## PartPicker (Fern)

Import from `src/components/viewer`. Full contract: [`src/components/viewer/README.md`](src/components/viewer/README.md).

```ts
import { PartPicker } from "@/components/viewer";
import type { ViewerPart } from "@/components/viewer";

<PartPicker
  src={machine.fileUrl}
  parts={machine.parts}
  selectedId={selectedId}
  onSelect={(part) => {
    /* { id, name, meshName, qty } or null */
  }}
/>
```

- `src` is Brent's `GET /api/machines/:id/file` (same-origin, session cookie). The viewer loads it with `credentials: "include"`. A cookie-less load 401s on the protected preview.
- `parts` is the joined named list only. `id` is the part number. Unmatched meshes are not quote-pickable.
- Rotate, zoom, and pan a loaded GLB/GLTF. Click a joined mesh → highlight + `onSelect`. Click empty space → `onSelect(null)`.
- Optional controlled `selectedId` lets a parts list highlight the mesh.
- Client-only (Next.js 16 App Router). The export is already `dynamic(..., { ssr: false })`.

Private developer check (not a customer/staff/login route): [http://localhost:3000/dev/viewer](http://localhost:3000/dev/viewer).

## Sample pack (staff upload)

Upload these together as one pack. Catalog join key is **part number**. This is a fake Total ETO-shaped BOM (`qty` on every row).

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
| `src/app/dev/viewer` | Private developer check for the sample pack |
| `src/components/viewer` | Browser 3D viewer (`PartPicker`) |
| `public/placeholders` | Sample GLB + fake ETO parts list |
| `src/lib/auth` | Authentication helpers |
| `src/types` | Shared TypeScript types |

## Do not go live

Keep this GitHub repository private. Do not publish a public site from this app. Preview or local development is fine; production and a custom domain are not part of T1.1.
