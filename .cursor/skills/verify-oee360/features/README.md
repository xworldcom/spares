# OEE360 verification map

Maintained recipes for user-facing Spares behavior. Read this index, run **Doctor**, then open the feature file that matches your change.

## Baseline preconditions

- **Local proof:** `launch` on port `3010` with disposable `SPARES_DATA_DIR` under `/tmp/oee360-verify-<run-id>`. Demo staff `staff@spares.local` / `SparesStaff1!` seeds on first API hit (same as `npm run dev` off Vercel).
- **Soft Launch:** `--base-url https://oee360.com`, app login only. No `@spares.local` on Production. Treat Blob-backed data as production; prefer read-only GETs and navigation.
- Run `control-oee360 doctor` and require `ok: true` before driving.
- Never drive a localhost server you did not start with `launch`.

## Driving conventions

- Start from the feature file’s preconditions unless noted.
- Prefer accessible names (`Email`, `Password`, `Sign in`, `Machines`) over CSS.
- API steps use `control-oee360 api` so cookies match browser session semantics.
- Restore mutated fixtures after a write test; keep proof artifacts.

## Proof and skip reporting

- Capture command output and resulting state (not only a final screenshot).
- UI proof includes ARIA snapshot and screenshot when the map calls for browser proof.
- API proof includes status code and JSON body for login and follow-up reads.
- Record feature id and entry point in `evidence/<run-id>/proof.json`.
- If an entry point is unreachable, log the attempted step and failed precondition; do not mark another path as covering it.

## Feature entry contract

Each feature file uses one intro paragraph and four H2 sections: `Sub-features`, `How to get to it (user POV)`, `Driving it with control-oee360`, `Gotchas`.

## Features

- [Email and password sign-in](./login.md) — landing login, session cookie, redirect to Machines.
- [Machines catalog and 3D pack](./machines.md) — list machines, open viewer, pick a part (read-only).
- [Quotes workspace and Care chat sheet](./quotes.md) — staff quote list and conversation fixture (Preview/local seeds).
- [Staff directory and platform hosts](./staff-directory-platform.md) — directory list and hosts platform (staff).
- [Staff create customer login](./staff-create-customer.md) — People UI creates a customer (local disposable store only).
