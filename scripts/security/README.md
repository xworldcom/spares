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

Login is limited to 8 attempts per IP per 15 minutes in one Node process. Restart the disposable app (or wait) before a second full matrix run.

## Two hosts, two plants each

`seed-two-hosts.ts` writes two OEM hosts (Acme Automation, Bolt Robotics) with a staff login each, and two plants per host with a site, a machine, a customer login, a quote, and a ticket. It refuses to run when a host it would create already exists.

```bash
export SPARES_DATA_DIR=/tmp/oee360-2x2
export SPARES_ALLOW_SEED=false
SEED_PASSWORD='ChooseOne-10chars' node --experimental-strip-types scripts/security/seed-two-hosts.ts
SPARES_PLATFORM_OWNER_EMAILS=staff@acme-oem.test npm run dev -- --port 3020
```

For a staging Blob namespace, replace `SPARES_DATA_DIR` with `BLOB_READ_WRITE_TOKEN` and `SPARES_BLOB_NAMESPACE=<fresh name>`. The script exits before writing when the namespace is unset, so Soft Launch data cannot be seeded by mistake.

Expected outcome for the tester. Each customer login lists one machine, one quote, one ticket. Each staff login lists both plants of its host and none of the other host. Quote and ticket numbers are global, so `#1` under the wrong host must 404.

## Production anonymous probe

```bash
node scripts/security/prod-anon-probe.mjs
```

Do not pass real customer passwords into a committed report. Use env vars for any authenticated rerun.
