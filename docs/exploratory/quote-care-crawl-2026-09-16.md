# Quote, Care, and isolation crawl (16 Sep 2026)

Production `https://oee360.com` at tip `a0413ca`. Shared Blob. Throwaway accounts only. No Vercel SSO. No customer invites. Payment stayed PO-only.

This is a findings report, not a product redesign. Isolation CODE RED items stay unfixed so Tess can route them.

**Side effect.** The isolation harness posted one probe message on ticket 4 (`PR96 Care attachment smoke`, `kevin@huzevka.com`). That write is itself proof of the hole. Do not treat it as a real customer note.

## Accounts

| Role | Email | Notes |
| --- | --- | --- |
| Host staff | `pr139-smoke-20260915-2316@spares.test` | Prior smoke. Not a platform owner. |
| Host staff (created) | `crawl-20260916-staff@spares.test` | `POST /api/staff/team` 201. |
| Customer A | `crawl-20260916-0524@spares.test` | Sites Dayton + Fort Worth. Machines Hardware fixture + Palletizer. |
| Customer B | `crawl-20260916-b@spares.test` | Palletizer only. No sites. |
| Not used | `kevin@huzevka.com` | Password path worked. Microsoft SSO skipped. |

Do not deactivate `buyer@acme.test`, `customer@spares.local`, or other demo rows.

## Quote and ticket ids

| Id | Number | What |
| --- | --- | --- |
| `b03fa31d-440f-4845-8b64-a8da371491f1` | 2 | Crawl A Hardware fixture quote. Walked Requested through Closed. PO `CRAWL-16-524`. Prices $12.50 and $340. Freight lived in a line note ($75). Tracking `1Z999CRAWL00000000` UPS. |
| `bdce508d-…` (prefix) | 3 | Second request from the customer UI tray. Left at Requested. |
| `quote-preview-qa-conversation` | 1 | Existing Acme QA quote. Customers could not read it. |
| `ac03a328-b1a4-42ee-860b-a92112f9ab35` | 5 | Crawl A Palletizer Care ticket. Staff set In progress. |
| `6abe3ee4-ce58-41da-8f27-a15bbf3ea041` | 4 | Kevin Hardware fixture ticket. Customer A listed, opened, and posted. |

## Coverage matrix

| Feature | Customer | Host staff | Platform owner |
| --- | --- | --- | --- |
| Password login | Pass | Pass | Not run (no Kevin password) |
| Machines catalog / 3D / List Add | Pass (List Add works). Catalog cards start blank. | Same blank-card flash | — |
| Request quote | Pass (quote 3). Tray can sit on Sending | Staff prices and statuses via API | — |
| Quote chat sheet | Pass after load. Collapse click can hang | Staff detail often stuck on Loading quote | — |
| Quote lifecycle | Pass via API. Customer sees prices after Quoted, PO, tracking | Pass. Statuses are free clicks, not a locked machine | — |
| Invoice number | Missing after staff PATCH 200 | Missing on GET after PATCH 200 | — |
| Care tickets + chat | Create and reply work. **Leaks other customers** | Staff can reply. List is machine-wide | — |
| Attachments | Chat attach exists. First `<input type=file>` on the quote page is the PO PDF field | — | — |
| Directory tabs / chips | — | All / Staff / Customers / People. No Hosts tab. Search id is `#tenant-directory-search`. Staff tab rendered an empty card. | API 403 for host staff |
| Create staff / customer / person | 403 | Customer A+B and staff create 201. Duplicate email 409 | — |
| Service visit log | — | `/machines/palletizer/care/service` showed Checking your session at 1.4s | — |
| Machine upload | — | `/machines/new` exists. Same session-check flash | — |
| Hosts / tenants UI | — | `/staff/tenants` copy. Platform owner access is required | Not run as owner |
| Platform APIs | 403 | GET/POST `/api/platform/tenants` and GET `/api/platform/directory` 403 | Not run as owner |
| Mobile More | Customer tabs Machines / Care / Quotes | More is Directory + Bug reports. Platform hidden | — |
| Cross-host isolation | No second tenant. Owner session required to create one | Cross-`tenantId` team GET/POST 403 | Blocked |

## CODE RED isolation

Root cause in code. `GET /api/tickets` and `requireTicketAccess` grant any user who can open the machine. Quotes filter by `customerId`. Care does not.

```26:30:src/app/api/tickets/route.ts
  const filtered = tickets
    .filter((ticket) => visible.has(ticket.machineId))
    .map((ticket) =>
      toPublicTicket(ticket, auth.user, visible.get(ticket.machineId)),
    );
```

```47:68:src/lib/care-http.ts
export async function requireTicketAccess(idOrNumber: string): Promise<TicketAccess> {
  // ...
  if (!machine || !canAccessCareMachine(user, machine, org.sites, org.customers)) {
    return { error: error("Ticket not found", 404) };
  }
  return { user, ticket, machine };
}
```

### CR1. Customer lists other customers' Care tickets

- Severity. CODE RED
- Role A. `crawl-20260916-0524@spares.test`
- Role B. `kevin@huzevka.com`, `customer@spares.local`, `staff@spares.local`
- Steps. Sign in as A. `GET /api/tickets`
- Expected. Only tickets A opened
- Actual. Four foreign tickets, including ticket 4 title `PR96 Care attachment smoke` and Kevin's email
- Proof. `docs/exploratory/evidence/crawl-20260916/isolation-report.json` id `cust-a-lists-foreign-tickets`

### CR2. Customer opens another customer's ticket

- Severity. CODE RED
- Role A. `crawl-20260916-0524@spares.test`
- Role B. `kevin@huzevka.com`
- Steps. `GET /api/tickets/6abe3ee4-ce58-41da-8f27-a15bbf3ea041`
- Expected. 404
- Actual. 200 with full activity, emails, and status `waiting_on_customer`
- Proof. isolation-report id `cust-a-reads-foreign-ticket`

### CR3. Customer writes on another customer's ticket

- Severity. CODE RED
- Role A. `crawl-20260916-0524@spares.test`
- Role B. `kevin@huzevka.com`
- Steps. `POST /api/tickets/6abe3ee4-ce58-41da-8f27-a15bbf3ea041/activity` with a crawl probe sentence
- Expected. 403 or 404
- Actual. 201. The probe is now on ticket 4
- Proof. isolation-report id `cust-a-writes-foreign-ticket`

### CR4. Second customer lists the first customer's ticket

- Severity. CODE RED
- Role A. `crawl-20260916-0524@spares.test` opened ticket 5 on Palletizer
- Role B. `crawl-20260916-b@spares.test` (Palletizer only)
- Steps. A `POST /api/machines/palletizer/tickets`. B `GET /api/tickets`
- Expected. B does not see A's ticket
- Actual. B's list includes ticket 5 and A's email
- Proof. isolation-report id `cust-b-lists-a-ticket`

### CR5. Second customer opens the first customer's ticket

- Severity. CODE RED
- Role A / B. Same as CR4
- Steps. B `GET /api/tickets/ac03a328-b1a4-42ee-860b-a92112f9ab35`
- Expected. 404
- Actual. 200
- Proof. isolation-report id `cust-b-reads-a-ticket`

Leave these as findings. A one-line `customerId` filter would close the hole if plant-shared tickets are not the intended product. That is Tess's call.

## What held

- Quote list and detail stay on `customerId`. A could not read quote 1 or `quote-preview-qa-conversation`. B could not read quote 2.
- B could not `GET /api/machines/hardware-fixture` (404). Machine grants work.
- Customer calls to `/api/staff/*` and `/api/platform/*` returned 401/403/404.
- Host staff `GET/POST /api/platform/tenants` and `GET /api/platform/directory` returned 403.
- Host staff `GET/POST /api/staff/team` with a foreign `tenantId` returned 403.
- Duplicate customer email returned 409.
- Customer `PATCH /api/machines/palletizer/usage` was rejected.
- Prices stay off the customer quote until Quoted. After Quoted the customer sees $12.50 and $340.
- Full staff status walk Requested → In review → Pricing → Quoted → PO received → Confirmed → Ordered → Shipped (needs tracking) → Delivered → Closed succeeded on the API.
- Desktop conversation bubbles sit on the correct sides. Staff is gray/other. Customer is blue/own.
- Mobile More hides Platform for this staff user.
- `/staff/tenants` tells host staff they are not the platform owner.

## Blocker

None that stop login or quote create for throwaway users. Treat the five CODE RED Care leaks as the ship-stoppers.

## Major

### M1. Invoice number does not persist

- Steps. Staff `PATCH /api/quotes/2` `{ "invoiceNumber": "INV-CRAWL-16" }` after Delivered (HTTP 200). Then `GET` as staff and as customer.
- Expected. `invoiceNumber` on the public quote once status has reached PO received
- Actual. Both GETs omit the field. Customer UI says "Invoice number appears here when issued."
- Screenshot. `docs/exploratory/evidence/crawl-20260916/06-customer-after-messages.png`

### M2. PO upload stays open on a Closed quote

- Steps. Open `/quotes/2` as the customer after Closed
- Expected. PO form gone, or read-only
- Actual. PO number field, PDF picker, and Upload PO still show. `canUploadPo` includes `closed`
- Screenshot. same as M1

### M3. Catalog cards paint blank, then fill

- Steps. Sign in. Screenshot `/machines` at about 1.4s
- Expected. Machine names visible as soon as the heading is up
- Actual. Empty rounded cards. Waiting for the Hardware fixture link makes names appear
- Screenshots. `01-customer-machines.png` (filled after wait), `s01-staff-machines.png` (blank)

### M4. Staff quote detail and Directory often sit on loading

- Steps. Staff `/staff/quotes/2`, `/staff/directory`, `/staff/directory?type=staff`
- Expected. Quote and directory rows within a second
- Actual. "Loading quote…", "Loading directory…", Staff tab as a blank card. People / Service / Platform / Upload / Bugs showed "Checking your session…" at 1.4s
- Screenshots. `s03-staff-quote-2.png`, `s05-staff-directory.png`, `s06-staff-directory-staff.png`, `s08-staff-directory-people.png`, `s09-staff-service.png`

### M5. Conversation collapse can fail

- Steps. Customer `/quotes/2`. Click Collapse conversation
- Expected. Sheet peeks or closes
- Actual. Playwright click waited 30s on a resolved button. Sheet stayed full and covered the right column
- Screenshot. `zz-cust-abort.png`

### M6. Request quote can linger on Sending

- Steps. Customer List tab. Add two parts. Request quote
- Expected. Quote sent + View quote
- Actual. Tray showed Sending. Quote 3 still appeared in the staff list as Requested
- Screenshot. `03-customer-quote-sent.png`

### M7. Production still has the QA quote fixture

- Steps. Staff `GET /api/quotes`
- Expected. No `quote-preview-qa-conversation` on Production
- Actual. Quote 1 for `buyer@acme.test` remains

## Minor

- No first-class freight field. Staff used a line note.
- Host Directory search is `#tenant-directory-search`, not `#directory-search` from the verify skill.
- Host Directory has no Hosts tab. Correct for non-owners. The skill map describes the platform table.
- Staff rows on Directory All are not links (`HostTenantDirectory`).
- Status strip clips later pipeline steps. Closed is a caption while Ordered / Shipped / Delivered sit off-screen.
- Add lives on List (and on a selected 3D part sheet). The 3D view empty tray copy says to tap a part, which does not add it.
- Quote poll is 3s. Live enough after a reload. Not websocket.
- Logout API clears the cookie. A client that keeps sending the old JWT still authenticates. Expected for this session design.

## Quote process gaps

The UI exposes the full pipeline. Staff can jump to any step, including backwards. There is no forced In review → Pricing → Quoted sequence. Shipped requires a tracking number. Invoice UI opens after PO received but the number did not save (M1). Freight is a note, not a line.

## Levers

Rerun from repo root with env emails and passwords. Do not commit secrets.

- `scripts/exploratory/crawl-oee360-isolation.mjs`
- `scripts/exploratory/crawl-oee360-conversation.mjs`
- `scripts/exploratory/crawl-oee360-ui.cjs`
- `scripts/exploratory/crawl-oee360-staff-pages.cjs`

JSON transcripts live under `docs/exploratory/evidence/crawl-20260916/`.

## Platform gap

Host staff cannot create a second install. Cross-host catalog leaks were not exercised. Same-host Care leaks are enough to treat isolation as broken for customers who share a machine.
