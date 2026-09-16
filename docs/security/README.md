# Security review notes

The September 2026 isolation review lives in [pentest-2026-09-16.md](./pentest-2026-09-16.md).

Rerun the checks from the repo root.

```bash
npm test -- src/lib/isolation-matrix.test.ts src/lib/catalog-merge.test.ts src/lib/access.test.ts src/lib/cors.test.ts
node scripts/security/prod-anon-probe.mjs
```

Local two-host HTTP matrix needs a disposable store and an owner login. See [scripts/security/README.md](../../scripts/security/README.md).
