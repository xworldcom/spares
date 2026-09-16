# Machine Care — Service log

Staff log service visits on a machine (primarily **last service date** and **notes**; hours/cycles optional) and review past visits from edit history.

## Sub-features

- `machine-care-service-tab` — **Service** tab on `/machines/[id]/care/service` (staff only).
- `machine-care-service-save` — **Save visit** persists via `PATCH /api/machines/:id/usage` (notes + date required for a meaningful log; meters optional).
- `machine-care-service-history` — **Edit history** rows link to `/machines/[id]/care/service/[visitId]` with snapshot notes.

## How to get to it (user POV)

- Sign in as staff, open **Machines**, pick a machine, open **Care** (or machine care entry).
- Choose the **Service** tab.
- Set **Last service**, add **Notes**, tap **Save visit** (meters optional under **Optional meters**).
- Tap a row under **Edit history** to read that visit’s notes.

## Driving it with control-oee360

Preconditions:

- Completed `login` feature with a **staff** session.
- A machine id from `api machines`.

- **Open service tab.** After login, browser navigate to `/machines/<id>/care/service`. Expect heading **Service** and button **Save visit** (never “Save usage”).
- **Legacy URL.** `/machines/<id>/care/usage` should redirect to `/care/service`.
- **API read.** `GET /api/machines/<id>/usage` with session cookie returns `usage` object and `history` array.
- **History detail.** After at least one save, open a history link; page shows **Service visit** and notes from `history[].snapshot`.

## Gotchas

- API path remains `/api/machines/:id/usage`; only UI copy and routes use **Service**.
- **Storage (Brent):** visit detail uses optional `history[].snapshot` on existing `machineUsage` rows (written on each save). No new route; older history rows may lack `snapshot`.
- Empty optional meter fields are omitted from PATCH so visit-only saves do not clear stored hours/cycles.
- Customers do not see the Service tab.
