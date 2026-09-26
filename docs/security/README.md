# Security review notes

The September 2026 isolation review lives in [pentest-2026-09-16.md](./pentest-2026-09-16.md). The public-page review follow-up, with the Microsoft `tid` binding and the two-plant proof, lives in [public-review-2026-09-26.md](./public-review-2026-09-26.md).

Evidence from the disposable local HTTP matrix and the production anonymous probe lives in [evidence/](./evidence/).

Rerun the checks from the repo root.

```bash
npm test -- src/lib/isolation-matrix.test.ts src/lib/plant-isolation.test.ts src/lib/sso-provision.test.ts src/lib/auth/microsoft.test.ts src/lib/auth/safe-url.test.ts
node scripts/security/prod-anon-probe.mjs
```

Local two-host HTTP matrix needs a disposable store and an owner login. See [scripts/security/README.md](../../scripts/security/README.md).
