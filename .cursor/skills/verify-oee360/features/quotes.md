# Quotes workspace and Care chat sheet

Quotes gives staff and customers a shared quote workspace with status pipeline, line pricing, activity feed, and the ConversationSheet UI on `/quotes/[id]` and staff list routes.

## Sub-features

- `quotes-list-staff` — `/staff/quotes` lists tenant quotes.
- `quotes-list-customer` — `/quotes` for customer-visible quotes.
- `quotes-detail` — conversation + line items on quote detail.
- `quotes-preview-fixture` — idempotent QA quote `quote-preview-qa-conversation` when seeds allowed.

## How to get to it (user POV)

- Staff: sign in → **Quotes** in staff nav → open a quote row.
- Customer: **Quotes** → open own quote.
- Preview/local: visiting `/staff/quotes` once seeds the QA fixture (see README).

## Driving it with control-oee360

Preconditions:

- Staff session (`staff@spares.local` locally or real staff on Soft Launch).
- `SPARES_ALLOW_SEED=true` on Preview or local dev for QA fixture (not Production).

- **Seed fixture (local).** Sign in, then `GET /staff/quotes` in browser or `curl` with cookie. Expect quote id `quote-preview-qa-conversation` after heal.
- **Quote API.** `GET /api/quotes` with cookie → array including fixture id when seeded.
- **Detail.** `GET /api/quotes/quote-preview-qa-conversation` → `status`, `items`, `activity`.
- **Proof.** Save JSON bodies under `evidence/<run-id>/quotes/`; note Soft Launch vs local in `proof.json`.

## Gotchas

- Production never seeds QA fixture; do not POST preview-fixture against Production without approval.
- Quote PATCH and activity POST mutate Blob; use local disposable store for write tests.
- Customer cannot see staff-only pricing fields before `quoted` status.
