# Public-page review hardening (26 Sep 2026)

Follow-up to [pentest-2026-09-16.md](./pentest-2026-09-16.md). An external reader of the public pages raised eight questions. This note answers each from the code on this branch, says what was wrong before, and points at the proof.

Rerun from the repo root.

```bash
npm test
SPARES_DATA_DIR=/tmp/oee360-2x2 SEED_PASSWORD='ChooseOne-10chars' node --experimental-strip-types scripts/security/seed-two-hosts.ts
# start the app as scripts/security/http-review-matrix.mjs describes, then
SEED_PASSWORD='ChooseOne-10chars' node scripts/security/http-review-matrix.mjs --base-url http://localhost:3020
```

## 1. Autoroute binds on `tid`, not on the email domain. Who enrolls.

**Before.** The Microsoft callback threw the `id_token` away, called Graph `/me`, and took `mail`, then `otherMails`, then `userPrincipalName` as the login email. An existing login matched by email string alone. An unknown email joined the host whose `ssoDomains` held its domain. `mail` and `otherMails` are attributes the attacker's own Entra admin sets, so an attacker tenant could name a user `victim@enrolled-host.com` and either take over that login or be created as staff on that host. That is the nOAuth class.

**Now.** `parseMicrosoftIdToken` reads the `id_token` from the token response and fails closed on `aud`, `iss`, `exp`, `nonce`, `alg`, and a GUID `tid`. Graph is gone. Email claims carry a `verified` flag from one trust table: `preferred_username` and `upn` are verified because Entra only issues UPN suffixes on domains the tenant proved, `email` is verified only with `xms_edov`, and nothing from the personal-account tenant is verified. `resolveMicrosoftCatalogUser(identity)`:

- An existing login signs in when a verified claim names it, or an unverified claim names it and the login's host enrolled the token `tid`.
- The first sign-in stores `microsoftTid` + `microsoftOid` on the row. A later token with a different pair is refused (`identity-mismatch`).
- A first sign-in with no matching login autoroutes only when one host enrolled both the email's domain (`ssoDomains`) and the token `tid` (`ssoTenantIds`) and has autoroute on.

**Who enrolls.** A platform owner (`SPARES_PLATFORM_OWNER_EMAILS`) on Platform → host → Microsoft SSO. The store refuses to turn autoroute on until the host has at least one domain and one Entra tenant id. Hosts that already had autoroute on with no tenant id stop autorouting until an owner adds the id. A denied Microsoft sign-in shows the person their tenant id on the login page so they can hand it to the host admin.

**Proof.** `src/lib/auth/microsoft.test.ts`, `src/lib/sso-provision.test.ts` (the test named for the nOAuth case is `enrolled domain, autoroute on, tid not enrolled`), `src/lib/auth/sso-domain.test.ts`. HTTP rows `enroll/*` and `microsoft/*` in [evidence/http-review-local.json](./evidence/http-review-local.json).

**Residual.** The `id_token` signature is not checked against JWKS. The token comes straight from the token endpoint over TLS with the client secret, which OIDC Core 3.1.3.7 allows. Turning on the `xms_edov` optional claim in the app registration makes `email` claims verified as well. Live Entra click-through was not run in this branch.

## 2. `next=` accepts same-origin relative paths only

**Before.** Two checks. `sanitizeNextPath` in the Microsoft module was strict. The login page had its own `startsWith("/") && !startsWith("//")`, which let `/\evil.example.test` through to `router.replace`.

**Now.** One `sanitizeNextPath` in `src/lib/auth/safe-url.ts`, used by the login page and the Microsoft route. `//`, `/\`, `https:`, `javascript:`, encoded slashes, tabs, and credentials all fall back to `/machines`. Query strings stay data. Tests in `src/lib/auth/safe-url.test.ts`, HTTP rows `next/*`.

## 3. Password path

- Rate limit and lockout. 8 attempts per 15 minutes per IP and per email (`src/lib/rate-limit.ts`). Held in process memory, so each Vercel instance counts on its own. The HTTP matrix hit it while being rerun, which is the observable proof.
- Reset tokens. None exist. There is no reset, forgot, or invite flow. Staff set the password at create time and it cannot be changed through the app afterwards. Nothing to expire, and a real gap for rotation.
- MFA. None for password users. The mitigation that exists is `PASSWORD_LOGIN=0` (or Platform → Sign-in off) so every login goes through Microsoft, where Entra Conditional Access enforces MFA.
- Not changed here. A durable lockout counter in the catalog was rejected because each failed attempt would trigger a Blob write an attacker controls.

## 4. Isolation in DB and API, both layers

- Host layer. Every store read and write takes `tenantId` and filters inside the store (`listMachines`, `getMachine`, `listQuotes`, `getQuote`, `listTickets`, `getTicket`, `listManuals`, `getManual`, `getMachineUsage`, `listCustomers`, `getOrgContext`). Quote and ticket numbers are global, so lookups filter the caller's host first. Covered since 16 Sep by `src/lib/isolation-matrix.test.ts`.
- Plant layer. Route helpers apply it on every request: `canAccessMachine` and `canAccessCareMachine` for machines, tickets, manuals, files, usage; `canViewQuote` for quotes, which is requester-only for customers. New `src/lib/plant-isolation.test.ts` walks two plants under one host through those helpers the way the routes do, including the pair "store returns Plant B's ticket for the host, route helper refuses Plant A's customer". It also records that a customer keeps their own quote history after a machine grant is revoked. That is product behavior, not a leak, and the test pins it.
- Fixed here. `model-upload` used `requireRole("staff")` and now uses `requireTenantStaff` like every other staff route.
- Intentional cross-host paths. `/api/platform/**` behind `requirePlatformOwner`, `/api/staff/team` for the cross-tenant admin list, and `/api/staff/activity` when a platform owner omits `tenantId`.
- HTTP rows `host/*` and `plant/*`.

## 5. Staff roles, MFA, audit

- Roles are `staff` and `customer` on the stored row. `requireRole` matches exactly, so a customer cannot reach `/api/staff/**` or `/api/platform/**`. Platform owner is a staff email on an allowlist, not a role a customer can hold.
- MFA. Same gap as question 3, same `PASSWORD_LOGIN=0` mitigation.
- Audit. Staff opening a quote or ticket now writes `quote.viewed` / `ticket.viewed`, once per staff login per record per hour. The activity log records only when `SPARES_ACTIVITY_LOG=true`. Soft Launch runs with it off because the live poll rewrote Blob every 1.5 s. Until it is on, no login or view is written. Turning it on is the follow-up, together with a slower refresh.

## 6. Agent tenancy

The assistant loads the machine, thread, manuals, and manual bytes with the `tenantId` of the request that triggered it (`src/lib/assistant/context.ts`, `generate.ts`, `reply.ts`). Every trigger route is behind `requireTicketAccess`, `requireMachineAccess`, or `requireQuoteAccess`. The deferred job is `after()` with the tenant on the job, not a cron. No cross-tenant read was found. A customer who owns a quote can trigger the assistant on that quote's machine after their machine grant is revoked. That follows from question 4's quote rule.

## 7. Inquire destination and spam

Submissions land in `accessInquiries` in the catalog (Blob `db.json`) and are read by platform owners under Platform → Inquiries. Guards: honeypot `company_fax`, 4 per minute per IP, and, new here, same-origin `Origin` check and a 16 KiB body cap. No Turnstile or hCaptcha in the stack. HTTP rows `inquire/*`.

## 8. Seeding two OEMs with two plants each

`scripts/security/seed-two-hosts.ts` writes Acme Automation and Bolt Robotics, a staff login each, and two plants per host with a site, machine, customer login, quote, and ticket. It refuses the default Blob namespace and refuses to run twice into one store. `scripts/security/http-review-matrix.mjs` then drives 55 checks against that store. See [../../scripts/security/README.md](../../scripts/security/README.md).

## Also fixed

`listAccountActivity` sorted same-millisecond events by random id, so `activity-log.test.ts` failed about one run in four. Ties now keep append order.

## Verification on this branch

| Check | Result |
| --- | --- |
| `npm test` | 604 passed, 0 failed |
| `npx tsc --noEmit` | clean |
| `npm run lint` | 87 problems, identical to `main`, none in touched files |
| Local HTTP matrix | 55 passed, 0 failed, [evidence/http-review-local.json](./evidence/http-review-local.json) |
| Live Microsoft sign-in | not run |

Decision trail. [decisions.tsv](./decisions.tsv).
