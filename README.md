# Spares

Spares is a private industrial spare-parts platform.

Internal staff upload a machine pack. Customers log in, inspect and rotate a machine in the browser, pick a named part, and request a quote.

This repository is **private by default**. The product is **not live**. Do not deploy this app to a public production URL, attach a public custom domain, or turn on public signup.

## What this pass is (T1.3)

This pull request is the **web UI** for Ticket 1. It consumes T1.2 APIs and wraps the T1.1 viewer slot.

- Cookie-session login for staff and customers (`POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`)
- Role-aware nav after `/api/auth/me`
- Staff: create customer accounts; upload a pack (machine name + GLB/GLTF + ETO-shaped parts list with part number, name, qty); see unmatched meshes
- Customer: open that machine; viewer chrome around Drew’s picker; selected part shows name and part number; request a quote with an optional note
- Empty, error, and not-signed-in states
- Qty on each parts-list row so it reads like an ETO BOM

If T1.1 or T1.2 are not on the same branch yet, the UI still ships against these contracts: typed clients, empty/error/not-signed-in states, and a labeled mount in `src/components/viewer`. This PR does **not** stub a fake 3D engine or invent a second item master.

## What this pass is not

No buy/cart/checkout UI, public marketing, self-serve signup, payments, SolidWorks converter, or go-live.

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

## API (T1.2)

The UI calls these routes with `credentials: "include"`:

- `POST /api/auth/login` — `{ email, password }` → `{ user }`
- `GET /api/auth/me` → `{ user }`
- `POST /api/auth/logout`
- `POST /api/staff/customers` — staff creates customer accounts
- `POST /api/machines` — multipart `name`, `model`, `partsList`
- `GET /api/machines` → `{ machines: [{ id, name }] }`
- `GET /api/machines/:id` — `parts: [{ id, name, meshName, qty }]` (`id` is the part number). Staff-only `unmatched`. Customers never see unmatched in the UI.
- `GET /api/machines/:id/file` — session-authenticated GLB/GLTF
- `POST /api/quotes` — customer `{ machineId, partIds, note? }`
- `GET /api/quotes` — staff inbox

Catalog source of truth is Total ETO (item master + job BOM). Join key is part number. Ticket 1 uses a fake ETO-shaped parts list.

## Repository layout

| Path | Work |
| --- | --- |
| `src/app` | App Router pages |
| `src/app/api` | Backend Route Handlers (T1.2) |
| `src/components/viewer` | Drew’s picker (rotate/zoom/pick) + Fern’s mount slot |
| `src/components` | Layout, nav, BOM, quote form, staff forms |
| `src/lib/api` | Typed API clients |
| `src/lib/auth` | Authentication helpers (T1.2) |

## Do not go live

Keep this GitHub repository private. Preview or local development is fine; production and a custom domain are not part of T1.3.
