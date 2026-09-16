# Isolation check scripts

These scripts assert deny and allow statuses. They do not print passwords.

## Local HTTP matrix

Start a disposable app, then run the matrix.

```bash
export SPARES_DATA_DIR=/tmp/oee360-pentest-$$
export SPARES_ALLOW_SEED=true
export SPARES_OWNER_EMAIL=owner@pentest.local
export SPARES_OWNER_PASSWORD='PentestOwner1!'
export SPARES_PLATFORM_OWNER_EMAILS=owner@pentest.local
npm run dev -- --port 3020
```

In another shell:

```bash
export SPARES_OWNER_EMAIL=owner@pentest.local
export SPARES_OWNER_PASSWORD='PentestOwner1!'
node scripts/security/http-isolation-matrix.mjs --base-url http://127.0.0.1:3020
```

Seed staff and customers are `staff@spares.local` / `customer@spares.local` / `buyer@acme.test` with the README preview passwords. Production rejects those logins.

## Production anonymous probe

```bash
node scripts/security/prod-anon-probe.mjs
```

Do not pass real customer passwords into a committed report. Use env vars for any authenticated rerun.
