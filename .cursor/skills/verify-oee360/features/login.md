# Email and password sign-in

Sign-in lets a staff or customer user authenticate with email and password on the private landing page, receive a session cookie, and reach the Machines catalog (or a `next` path).

## Sub-features

- `login-form` renders Email, Password, and Sign in on `/login`.
- `login-api` accepts JSON credentials and sets `spares_session`.
- `login-redirect` sends signed-in users away from the landing animation to `/machines` by default.
- `login-me` exposes the current user on `GET /api/auth/me`.

## How to get to it (user POV)

- Open `/login` (or `/` while signed out).
- Enter email and password, then choose **Sign in**.
- Optional: `/login?next=/quotes` after sign-in as customer with quote access.

## Driving it with control-oee360

Preconditions:

- Local: `launch --port 3010` and `doctor` reports `ok: true` for `http://127.0.0.1:3010`.
- Credentials: `staff@spares.local` / `SparesStaff1!` (local disposable store only; blocked on Production).
- Evidence directory from `evidence-path`.

- **Landing reachable.** Open `/login`. Run `doctor --base-url http://127.0.0.1:3010`. Status checks include `GET /login` ok.
- **Anonymous session.** Run `api me`. Expect HTTP `401` or body without a user.
- **Sign in.** Run `api login --email staff@spares.local --password 'SparesStaff1!'`. Expect HTTP `200` and JSON `user.email` matching the address.
- **Session read.** Run `api me`. Expect HTTP `200` and `body.user.role` `staff`.
- **Authorized catalog read.** Run `api machines`. Expect HTTP `200` and a `machines` array (seed fixtures after first touch).
- **Browser identity (optional).** Run `browser snapshot-aria --path evidence/<run-id>/login.aria.txt`. File contains `Email`, `Password`, and `Sign in`.
- **Proof bundle.** Write `evidence/<run-id>/proof.json` with feature `login`, entry `api login`, and paths to `login-api.json` transcripts you saved from the api commands.

## Gotchas

- Landing animation waits ~1.8s before the form is fully shown; API login ignores that delay.
- Production rejects demo `@spares.local` even if copied Preview `db.json` lists them.
- Login rate limit: 8 attempts / 15 minutes per IP and email.
- Do not put passwords in URLs; the app strips credential query keys.
- Microsoft sign-in requires `AZURE_AD_*` env; email/password remains available when unset.
