# Machine Care — Service log

Staff log service visits on a machine (hours, cycles, last service date, notes) and review past visits from edit history.

## Sub-features

- `machine-care-service-tab` — **Service** tab on `/machines/[id]/care/service` (staff only).
- `machine-care-service-save` — **Save service** persists via `PATCH /api/machines/:id/usage`.
- `machine-care-service-history` — **Edit history** rows link to `/machines/[id]/care/service/[visitId]` with snapshot notes.

## How to get to it (user POV)

- Sign in as staff, open **Machines**, pick a machine, open **Care** (or machine care entry).
- Choose the **Service** tab.
- Fill the form and tap **Save service**.
- Tap a row under **Edit history** to read that visit’s notes.

## Driving it with control-oee360

Preconditions:

- Completed `login` feature with a **staff** session.
- A machine id from `api machines`.

- **Open service tab.** After login, browser navigate to `/machines/<id>/care/service`. Expect heading **Service** and button **Save service** (not “Save usage”).
- **Legacy URL.** `/machines/<id>/care/usage` should redirect to `/care/service`.
- **API read.** `GET /api/machines/<id>/usage` with session cookie returns `usage` object and `history` array.
- **History detail.** After at least one save, open a history link; page shows **Service visit** and notes from `history[].snapshot`.

## Gotchas

- API path remains `/api/machines/:id/usage`; only UI copy and routes use **Service**.
- History entries saved before this feature may lack `snapshot`; detail page shows summary only.
- Customers do not see the Service tab.
