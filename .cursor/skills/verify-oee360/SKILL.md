---
name: verify-oee360
description: Drive the Spares / OEE360 Next.js app like a user — local disposable store or Soft Launch URL with app login. Use before shipping UI/auth/quote/machine changes, or when an agent needs launch/doctor/drive proof with captured evidence.
---

# Verify OEE360 (Spares)

Primary surface is the **web App Router UI** at `/login`, `/machines`, `/quotes`, and staff routes under `/staff/*`. Secondary surfaces are the **JSON Route Handlers** under `/api/*` (same session cookie as the browser). The SolidWorks add-in is out of scope for this skill.

Helper (run from repo root):

```bash
node .cursor/skills/verify-oee360/scripts/control-oee360.mjs <command>
```

Set `OEE360_VERIFY_RUN_ID` to pin evidence and data directory names across commands in one run.

## Launch

**Local (preferred for mutations and demo seeds)**

1. Pick a run id: `export OEE360_VERIFY_RUN_ID=$(date +%s)`
2. Isolated file store: `export SPARES_DATA_DIR=/tmp/oee360-verify-$OEE360_VERIFY_RUN_ID` (default inside `launch` when unset)
3. Start dev server on a non-default port to avoid clashing with an existing `3000`:

```bash
node .cursor/skills/verify-oee360/scripts/control-oee360.mjs launch --port 3010
```

Ready when `GET http://127.0.0.1:3010/login` returns `200`. Logs: `.cursor/skills/verify-oee360/.run-state/dev.log`.

**Soft Launch / Production (`https://oee360.com`)**

Do **not** start a second Next instance against Production. Drive the deployed URL only with `--base-url https://oee360.com`. Use **read-only** flows unless Kevin explicitly approves writes. Demo `staff@spares.local` is **blocked on Production** (`SPARES_ALLOW_SEED` off). Use real staff credentials or Microsoft sign-in. Vercel Deployment Protection may be off for live testing; **app login still applies**.

**Teardown (local only)**

```bash
node .cursor/skills/verify-oee360/scripts/control-oee360.mjs stop
```

Kills only the pid recorded in `.cursor/skills/verify-oee360/.run-state/state.json` (the process group from `launch`). Never `pkill node`.

## Doctor

Read-only health check before driving:

```bash
node .cursor/skills/verify-oee360/scripts/control-oee360.mjs doctor
# or remote:
node .cursor/skills/verify-oee360/scripts/control-oee360.mjs doctor --base-url https://oee360.com
```

Require JSON `ok: true`. Checks `GET /login` and anonymous `GET /api/auth/me` (401 or 200). If local, confirm `runState.dataDir` matches your disposable `SPARES_DATA_DIR`. Do not drive a shared localhost `:3000` instance you did not launch.

## Drive

**Browser (first run installs Chromium under `scripts/node_modules`)**

```bash
cd .cursor/skills/verify-oee360/scripts && npm install --omit=dev
```

**Browser conventions**

- Login form: labels `Email`, `Password`, submit button name `Sign in` (`#email`, `#password` in DOM).
- After sign-in, customers land on `/machines` (`h1` `Machines`).
- Staff nav includes `/staff/quotes`, `/staff/directory`, `/staff/tenants` (platform owners).

**API conventions**

- `POST /api/auth/login` JSON `{ "email", "password" }` → `{ user }` and `spares_session` cookie.
- `GET /api/auth/me` with cookie → `{ user }`.
- All mutating customer/staff calls need `credentials: "include"` in browser; helper sends stored cookie.

Pick a feature file under `features/` and follow its **Driving it with control-oee360** section. Proof must follow the user path in that file, not test-only shortcuts unless the map says so.

## Evidence

Directory for a run:

```bash
node .cursor/skills/verify-oee360/scripts/control-oee360.mjs evidence-path
```

Default layout: `.cursor/skills/verify-oee360/evidence/<OEE360_VERIFY_RUN_ID>/`.

**Proof standards**

- Exercise the real user path (login → navigate → visible outcome or authorized API read).
- Capture **action + resulting state**: API JSON transcripts plus, when UI matters, screenshot and ARIA snapshot with app identity visible (`BrandMark` / `Machines` heading).
- Prefer read-only checks on Soft Launch Blob data; local disposable `SPARES_DATA_DIR` for seed demos (`staff@spares.local` / `SparesStaff1!` per README).
- Record feature id and entry point in a short `proof.json` beside artifacts.

Do not use public marketing flows or invite customers. `robots` noindex is acceptable.

## Cleanup

After proof:

```bash
node .cursor/skills/verify-oee360/scripts/control-oee360.mjs stop
```

Remove only the launched dev server and `.run-state/cookies.txt` if you want a clean jar; **keep** everything under `evidence/<run-id>/`. Optional: delete `/tmp/oee360-verify-<run-id>` when you no longer need local seed data.

Never delete evidence during cleanup. Never redeploy Production solely to refresh this skill.

## Helpers

| Command | Purpose |
| --- | --- |
| `launch [--port N]` | Start `npm run dev` with isolated `SPARES_DATA_DIR` |
| `stop` | Stop tracked dev server |
| `doctor [--base-url URL]` | Readiness JSON |
| `api login --email E --password P` | Session cookie in jar |
| `api me` | Current user |
| `api machines` | Machine list (authenticated) |
| `browser screenshot --path FILE` | Full-page `/machines` after cookie |
| `browser snapshot-aria --path FILE` | Login page ARIA snapshot |
| `evidence-path` | Print evidence directory |

**Maintenance:** run `/maintain-verification-skill` when routes or copy change; update the matching file under `features/`.
