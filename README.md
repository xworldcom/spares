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

There is **no public signup**. Staff create customer accounts. These two users are **private-preview credentials only** — not production accounts. They are seeded automatically the first time the API store is created. **Do not show these passwords on the login screen.**

| Role | Email | Password |
| --- | --- | --- |
| staff | `staff@spares.local` | `SparesStaff1!` |
| customer | `customer@spares.local` | `SparesCustomer1!` |

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

## API (T1.2, stacked from #7)

The UI calls these routes with `credentials: "include"`:

- `POST /api/auth/login` JSON `{ email, password }` → `{ user }`
- `POST /api/auth/logout`
- `GET /api/auth/me` → `{ user }`
- `POST /api/staff/customers` — staff creates customer accounts
- `POST /api/machines` — multipart `name`, `model`, `partsList`
- `GET /api/machines` → `{ machines: [{ id, name }] }`
- `GET /api/machines/:id` → `{ id, name, fileUrl, parts: [{ id, name, meshName, qty }], unmatched?: [...] }`
- `GET /api/machines/:id/file` — session cookie required; this is the viewer `src`
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
