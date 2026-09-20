# Machines catalog and 3D pack

Machines lets an authenticated user open the catalog, choose a machine pack, inspect the 3D model, and highlight a named part in the viewer.

## Sub-features

- `machines-list` shows assigned machines on `/machines`.
- `machines-detail` opens `/machines/[id]` with PartPicker.
- `machines-part-select` highlights a joined part from the BOM list or mesh pick.
- `machines-file` loads GLB via presigned URL or credentialed `/api/machines/:id/file`.

## How to get to it (user POV)

- Sign in, land on **Machines**.
- Choose a machine name link (seed: **Hardware fixture** or **Palletizer** locally). Cards also offer **Quotes**, **Tickets**, and **Manuals** for that machine.
- Click a part row or pick geometry in the canvas. The machine header stays on quotes and tickets: on small screens the back title is the machine name (`‹ Palletizer`) over a tabs-only strip (Model, Quotes, Tickets, Manuals, Service for staff). Desktop keeps Brand or `‹ Machines` plus the name beside those tabs. There is no Overview tab.

## Driving it with control-oee360

Preconditions:

- Completed `login` feature (session cookie in jar).
- Local seeds present (`hardware-fixture`, `palletizer` ids after catalog heal).

- **List machines.** Run `api machines`. Expect at least one machine with `name` and `id`.
- **Machine detail.** `curl -b cookies` `GET /api/machines/<id>` or use browser after login. Expect `parts` array with `partNumber` / `name` / `qty`.
- **Viewer proof.** After login cookie set, run `browser screenshot --path evidence/<run-id>/machines.png`. Image shows **Machines** or machine detail heading and viewer canvas region.
- **Proof.** Record machine id and part count in `proof.json`.

## Gotchas

- Customer GET omits `unmatched`; staff sees unmatched panel.
- Large GLBs on Preview need R2; local dev may serve from `./data` or placeholders.
- Without cookie, `/api/machines/:id/file` returns unauthorized.
- 3D pick timing depends on GLB load; wait for canvas before screenshot proof.
