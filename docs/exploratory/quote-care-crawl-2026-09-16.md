# Quote, Care, and isolation crawl (16 Sep 2026)

Production `https://oee360.com`. The crawl treated the deploy as `origin/main` `a0413ca`. The app does not expose a build SHA, so that match is inferred. Shared Blob. Throwaway accounts only. No Vercel SSO. No customer invites. Payment stayed PO-only.

This is a findings report, not a product redesign. Care CR1 through CR9 stay unfixed so Tess can route the product call. CR10 and the numeric Care URL one-liners landed in this branch and are not on Production yet.

**Side effects that remain on Production.**

- Probe message on Kevin's ticket 4 (`PR96 Care attachment smoke`).
- Quote 2 walked to Closed with invented prices and PO `CRAWL-16-524`.
- Invoice PATCH on quote 2. The number did not persist.
- Service note on Palletizer usage.
- Directory names set to Crawl Hunt A and Crawl Hunt B.
- Live throwaways still able to sign in. `pr139-smoke-20260915-2316@spares.test`, `crawl-20260916-staff@spares.test`, `crawl-20260916-0524@spares.test`, `crawl-20260916-b@spares.test`.
- Soft-deleted `crawl-wide-person-20260916@spares.test` cannot sign in.

Do not treat the ticket 4 probe as a real customer note. Do not deactivate protected demos.

## Accounts

| Role | Email | Notes |
| --- | --- | --- |
| Host staff | `pr139-smoke-20260915-2316@spares.test` | Prior smoke. Not a platform owner. `tenantId` `tenant-oee360-host`. |
| Host staff (created) | `crawl-20260916-staff@spares.test` | `POST /api/staff/team` 201. Platform APIs 403. |
| Customer A | `crawl-20260916-0524@spares.test` | Sites Dayton + Fort Worth. Machines Hardware fixture + Palletizer. |
| Customer B | `crawl-20260916-b@spares.test` | Palletizer only. No sites. |
| Soft-deleted | `crawl-wide-person-20260916@spares.test` | Created then `DELETE`. Login after delete 401. |
| Not used | `kevin@huzevka.com` | Never signed in. Password was out of bounds. Microsoft SSO skipped. |

Do not deactivate `buyer@acme.test`, `customer@spares.local`, or other demo rows.

## Quote and ticket ids

| Id | Number | What |
| --- | --- | --- |
| `b03fa31d-440f-4845-8b64-a8da371491f1` | 2 | Crawl A Hardware fixture quote. Walked Requested through Closed. PO `CRAWL-16-524`. Prices $12.50 and $340. Freight in a line note ($75). Tracking `1Z999CRAWL00000000` UPS. |
| quote 3 | 3 | Second request. Two concurrent staff PATCH calls both returned 200. The GET after that race was `in_review`. A later price PATCH used part ids that were not on the quote and got HTTP 400. |
| `quote-preview-qa-conversation` | 1 | Existing Acme QA quote. Customers could not read it. |
| `ac03a328-b1a4-42ee-860b-a92112f9ab35` | 5 | Crawl A Palletizer Care ticket. Staff set In progress. Two-way notes exist. |
| `6abe3ee4-ce58-41da-8f27-a15bbf3ea041` | 4 | Kevin Hardware fixture ticket. Customer A listed, opened, posted, and downloaded the JPEG. |

## Coverage matrix

| Feature | People / customer | Staff / host | Platform owner |
| --- | --- | --- | --- |
| Password login | Pass. Bad password shows Invalid email or password. | Pass. Second throwaway staff also Pass. | Not run. Kevin was not signed in. |
| Logout | `POST /api/auth/logout` 200. Next `GET /api/auth/me` with the same JWT still 200. | Same session design. | — |
| Machines catalog / 3D / List Add | Pass after wait. Cards and detail often start on Loading. | Same blank-card / Loading flash. | — |
| Request quote | Pass (quotes 2 and 3). | Staff prices and statuses via API. | — |
| Quote chat sheet | Pass after load. Desktop overlay has no ×. Handle exists. | Staff detail loads after wait. | — |
| Quote lifecycle | Pass via API on quote 2. Customer sees $12.50 and $340 after Quoted. PO and tracking show. | Pass. Statuses are free clicks. One concurrent PATCH sample both 200. GET after that sample was `in_review`. | — |
| Invoice number | Missing after staff PATCH 200. | Missing on GET after PATCH 200. Root is `normalizeStoredQuote` dropping the field. | — |
| Care tickets + chat | Create and reply work. Machine-shared tickets are visible across customers who share the machine. Numeric URL `/care/tickets/5` shows an empty sheet. UUID URL shows the thread. | Staff can reply and change status. List is machine-wide. | — |
| Attachments | Customer A downloaded Kevin's ticket 4 JPEG (HTTP 200). Quote 2 upload and download stay on `customerId`. B got 403 on A's quote attachment routes. First file input on a quote page is the PO PDF field. | — | — |
| Nav / empty / error | Customer tabs Machines / Care / Quotes. Service tab says Wrong role This page is for staff only. | Staff chrome includes Directory, Quotes, Bug reports. Platform hidden in More. | — |
| Directory chips / tabs / drill-in | 403 on staff APIs. | All / Staff / Customers / People. Search `#tenant-directory-search`. People rows link to `/staff/directory/:id`. Staff rows are not links. Customers tab can sit on skeleton bars. PATCH name on A and B 200. | API 403 for host staff |
| Create staff / customer / person | 403 | Customer A+B, wide person, and staff create 201. Duplicate email 409. Soft-delete then login 401. Missing person DELETE 404. | — |
| Machine upload / packs | GET `/api/machines/model-upload` 403. POST pack 403. | Upload pack UI renders. GET model-upload 200 (`s3Upload` true, 256 MB). | — |
| Service visit log | Customer UI blocked. GET/PATCH usage 403. | `/machines/palletizer/care/service` form works after wait. PATCH notes 200. History shows the crawl staff row. | — |
| Team / access | 403 | GET `/api/staff/team` 200, 4 staff. `/staff/team` redirects to Directory Staff tab. | Cross-`tenantId` team GET/POST 403 |
| Hosts board | — | `/staff/tenants` and `/staff/platform` tell host staff they are not the platform owner. | Not run as owner |
| Platform APIs | 403 / 401 | GET/POST tenants, GET directory, GET staff, GET deployments, GET directory user all 403. | Not run as owner |
| Bugs | GET `/api/bugs` 403 | GET 200, 1 report. `/staff/bugs` renders. | — |
| Cross-host isolation | No second tenant. | Foreign `tenantId` on team APIs 403. | Blocked. Owner session required to create a host. |
| Soft-delete | Login after delete 401. | DELETE throwaway 200. | — |
| Concurrent writes | — | Two PATCH on quote 3 both 200. One sample. GET after that sample was `in_review`. | — |
| Blob catalog clobber | — | `normalizeStoredQuote` dropped `tenantId` and `invoiceNumber` on every catalog read. Fixed in this branch. | Not live-proven on a second host |

## CODE RED isolation

Root cause in code. Care grants any user who can open the machine. Quotes filter by `customerId`. Care does not.

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

Live count on Production. **Nine endpoints, one machine-scope rule.** Care copy on `/care` says "work tickets across your plant" and "Across every machine you can access." A and B were both granted Palletizer. Quotes filter by `customerId`. Care does not. That difference is measured. Whether it is a leak or the product is Tess's call. The nine rows below are the endpoints that share that rule. Do not treat the count as nine independent bugs.

CR10 is a separate catalog-load hole. This branch keeps `tenantId` and `invoiceNumber`. It is not live-proven on a second host.

### CR1. Customer lists other customers' Care tickets

- Severity. CODE RED
- Role A. `crawl-20260916-0524@spares.test`
- Role B. `kevin@huzevka.com`, `customer@spares.local`, `staff@spares.local`
- Steps. Sign in as A. `GET /api/tickets`
- Expected if tickets are private per customer. Only tickets A opened
- Actual. Four other customers' tickets, including ticket 4 title `PR96 Care attachment smoke` and Kevin's email. The hub copy says tickets across every machine you can access.
- Proof. `docs/exploratory/evidence/crawl-20260916/isolation-report.json` id `cust-a-lists-foreign-tickets`. UI. `docs/exploratory/evidence/crawl-20260916-wide/u05-care-ticket-number.png`

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
- Steps. `POST /api/tickets/6abe3ee4-ce58-41da-8f27-a15bbf3ea041/activity`
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

### CR6. Customer downloads another customer's Care attachment

- Severity. CODE RED
- Role A. `crawl-20260916-0524@spares.test`
- Role B. `kevin@huzevka.com`
- Steps. `GET /api/tickets/6abe3ee4-ce58-41da-8f27-a15bbf3ea041/attachments/chat-2d010ceb-0b04-4807-b7f2-e26e5b2d7f96.jpg`
- Expected. 403 or 404
- Actual. 200 `image/jpeg`
- Proof. `docs/exploratory/evidence/crawl-20260916-wide/wide-report.json` id `cust-a-reads-foreign-ticket-attachment`

### CR7. Care overview lists other customers' tickets

- Severity. CODE RED
- Role A. `crawl-20260916-0524@spares.test`
- Role B. `customer@spares.local`, `staff@spares.local`
- Steps. `GET /api/machines/palletizer/care`
- Expected. Only A's tickets, or no foreign emails
- Actual. `recentTickets` includes QA soft-launch ticket and Care MVP re-smoke
- Proof. wide-report id `cust-a-care-overview-foreign`

### CR8. Second customer care overview lists the first customer's ticket

- Severity. CODE RED
- Role A. `crawl-20260916-0524@spares.test`
- Role B. `crawl-20260916-b@spares.test`
- Steps. B `GET /api/machines/palletizer/care`
- Expected. B does not see ticket 5
- Actual. `recentTickets` includes ticket 5 title `Crawl A palletizer isolation ticket`
- Proof. wide-report id `cust-b-care-overview-sees-a`

### CR9. Second customer machine ticket list includes the first customer's ticket

- Severity. CODE RED
- Role A / B. Same as CR8
- Steps. B `GET /api/machines/palletizer/tickets`
- Expected. Only B's tickets
- Actual. List includes ticket 5 and A's email
- Proof. wide-report id `cust-b-machine-tickets-see-a`

### CR10. Catalog load dropped quote `tenantId` (latent host leak)

- Severity. CODE RED (code). Not live-proven on a second host.
- Role A. Host staff on `tenant-oee360-host`
- Role B. Any satellite tenant quote in the same Blob
- Steps. Read `normalizeStoredQuote` in `src/lib/quotes.ts`. `parseDatabase` in `src/lib/store.ts` maps every quote through it. `belongsToTenant` treats a missing `tenantId` as the default host.
- Expected. A quote keeps its `tenantId` across load and write
- Actual. Production tip dropped `tenantId` and `invoiceNumber` on every catalog read. The next persist would write the stripped row.
- Fix in this branch. Keep both fields. Test in `src/lib/quotes.test.ts`.
- Live gap. Host staff cannot `POST /api/platform/tenants` (403). Kevin's password was out of bounds.

## What held

- Quote list and detail stay on `customerId`. A could not read quote 1 or `quote-preview-qa-conversation`. B could not read quote 2. B `GET /api/quotes/2` 403. B `GET /api/quotes/2/attachments/upload` 403. B `GET` of a fake quote attachment 403. A `GET` of that fake file 404. No file was uploaded. The download of a real quote chat file was not exercised.
- B could not `GET /api/machines/hardware-fixture` (404), `/file` (404), or `/manuals` (404). Machine grants work.
- Customer calls to `/api/staff/*`, `/api/platform/*`, `/api/bugs`, model-upload, pack, and usage returned 401/403/404. Customer `PATCH /api/tickets/5` status 403.
- Host staff platform tenants, directory, staff, deployments, and directory user all 403. Second staff user same 403.
- Host staff `GET/POST /api/staff/team` with a foreign `tenantId` returned 403.
- Duplicate customer email returned 409. Soft-deleted throwaway login 401. Missing person DELETE 404.
- Prices stay off the customer quote until Quoted. After Quoted the customer sees $12.50 and $340 on quote 2.
- Full staff status walk Requested through Closed succeeded on quote 2. Tracking required for Shipped.
- Desktop conversation bubbles sit on the correct sides. Staff is gray/other. Customer is blue/own. Two-way thread is on `/quotes/2` and `/care/tickets/<uuid>`.
- Customer Service tab shows Wrong role This page is for staff only.
- Staff Service visit form accepts notes. History shows the crawl staff row.
- Upload pack UI renders. S3 client upload is available.
- `/staff/tenants` and `/staff/platform` tell host staff they are not the platform owner.
- Mobile More hides Platform for this staff user.

## Blocker

None that stop login or quote create for throwaway users. Care CR1 through CR9 are one product question. Do not treat them as nine ship-stoppers until Tess decides whether plant-shared tickets are intended.

## Major

### M1. Invoice number does not persist on Production

- Steps. Staff `PATCH /api/quotes/2` `{ "invoiceNumber": "INV-CRAWL-WIDE-16" }` (HTTP 200). Then `GET` as staff and as customer.
- Expected. `invoiceNumber` on the public quote once status has reached PO received
- Actual. Both GETs omit the field. Customer UI says "Invoice number appears here when issued."
- Root. `normalizeStoredQuote` dropped `invoiceNumber` on catalog load.
- Fix in this branch. Keep the field. Not on Production until this ships.
- Screenshot. `docs/exploratory/evidence/crawl-20260916-wide/u18-quote-2-wait.png`

### M2. PO upload stays open on a Closed quote

- Steps. Open `/quotes/2` as the customer after Closed
- Expected. PO form gone, or read-only
- Actual. PO number field, PDF picker, and Save PO number still show. `canUploadPo` includes `closed`
- Screenshot. same as M1

### M3. Catalog cards paint blank, then fill

- Steps. Sign in. Screenshot `/machines` at about 1.6s
- Expected. Machine names visible as soon as the heading is up
- Actual. One headless run on a cloud VM showed Loading machines… at about 1.6s. No network baseline.
- Screenshots. `u01-machines.png`, earlier `s01-staff-machines.png`

### M4. Staff Directory and several pages sit on loading or skeleton

- Steps. Staff `/staff/directory`, `/staff/directory?type=customer`, `/staff/quotes/2` at 1.4s to 3s
- Expected. Rows and quote within a second
- Actual. One headless run showed "Loading directory…", skeleton bars on Customers, and "Loading quote…" until a heading wait. `/staff/team` and `/staff/people` are Directory query aliases and do load. Directory drill-in to a person page was not captured.
- Screenshots. `w01-directory.png`, `w17-directory-no-links.png`

### M5. Desktop overlay has no ×. Collapse can hang

- Steps. Customer `/quotes/2` at 1440px after the quote loads
- Expected. A close control that peeks the sheet
- Actual. The × header renders only when `layout === "overlay" && !desktop`. `collapseToPeek` is dead. The drag handle uses aria-label Collapse conversation. An earlier Playwright click on that handle waited 30s.
- Screenshots. `u18-quote-2-wait.png`, earlier `zz-cust-abort.png`

### M6. Request quote can linger on Sending

- Steps. Customer List tab. Add two parts. Request quote
- Expected. Quote sent + View quote
- Actual. Tray showed Sending. Quote 3 still appeared in the staff list as Requested
- Screenshot. earlier `03-customer-quote-sent.png`

### M7. Production still has the QA quote fixture

- Steps. Staff `GET /api/quotes`
- Expected. No `quote-preview-qa-conversation` on Production
- Actual. Quote 1 for `buyer@acme.test` remains

### M8. Numeric Care URL leaves the sheet empty

- Steps. Customer A. Open `/care/tickets/5`. Then `/care/tickets/ac03a328-b1a4-42ee-860b-a92112f9ab35`. Repeat under `/machines/palletizer/care/tickets/5`.
- Expected. Ticket 5 title, status strip, and notes
- Actual. Numeric URL highlights the row and shows "No messages yet." UUID URL shows the full thread. `TicketDetail` compared `ticket.id === ticketId` only. `getTicket` already accepts a number.
- Fix in this branch. Match number or id, same as `QuoteWorkspace`. Not on Production until this ships.
- Screenshots. `u05-care-ticket-number.png`, `u07-machine-ticket-number.png`, `u19-care-uuid-wait.png`

### M9. Staff PATCH cannot add a part that was not on the quote

- Steps. Staff `PATCH /api/quotes/3` with invented line ids `5972K325` and `6331K32`
- Expected. HTTP 400 if those ids were not on the quote
- Actual. HTTP 400 `cannot add a part that was not on this quote`. That matches `mergeQuoteItems`. The crawl did not open a staff UI to add a new line.
- Proof. wide-report coverage `price quote 3` 400

## Minor

- No first-class freight field. Staff used a line note.
- Host Directory search is `#tenant-directory-search`, not `#directory-search` from the verify skill.
- Host Directory has no Hosts tab. Correct for non-owners.
- Staff rows on Directory All are not links (`HostTenantDirectory`).
- Status strip clips later pipeline steps. Closed is a caption while Ordered / Shipped / Delivered sit off-screen.
- Add lives on List (and on a selected 3D part sheet). The 3D view empty tray copy says to tap a part, which does not add it.
- Quote poll is 3s. Live enough after a reload. Not websocket.
- Logout API clears the cookie. A client that keeps sending the old JWT still authenticates. Expected for this session design. Wide crawl `logout then me` 200/200.
- Customer mobile tab bar is Machines / Care / Quotes. There is no More button. Staff More hides Platform.
- `/staff/team` and `/staff/people` rewrite to Directory query tabs.

## Quote process gaps

The UI exposes the full pipeline. Staff can jump to any step, including backwards. There is no forced In review to Pricing to Quoted sequence. Shipped requires a tracking number. Invoice UI opens after PO received but the number did not save on Production (M1). Freight is a note, not a line. Staff cannot add a new part after create (M9).

## Levers

Rerun from repo root with env emails and passwords. Do not commit secrets.

- `scripts/exploratory/crawl-oee360-isolation.mjs`
- `scripts/exploratory/crawl-oee360-conversation.mjs`
- `scripts/exploratory/crawl-oee360-ui.cjs`
- `scripts/exploratory/crawl-oee360-staff-pages.cjs`
- `scripts/exploratory/crawl-oee360-wide.mjs`
- `scripts/exploratory/crawl-oee360-ui-wide.cjs`
- `scripts/exploratory/crawl-oee360-ui-wait.cjs`

JSON transcripts live under `docs/exploratory/evidence/crawl-20260916/` and `docs/exploratory/evidence/crawl-20260916-wide/`.

## One-liners in this branch

- `normalizeStoredQuote` keeps `invoiceNumber` and `tenantId`. A test now asserts every `QuoteRecord` key survives a catalog load.
- `ticketRefMatches` treats a numeric Care URL as ready. `TicketDetail` and `TicketsWorkspace` use it. Covered in `src/lib/care.test.ts`.

Care CR1 through CR9 stay unfixed. CR10 is guarded in this branch.

## Platform gap

Host staff cannot create a second install. Cross-host catalog leaks were not exercised live. Same-host Care is machine-scoped for every customer who can open that machine.

## Review notes

[Trail review](7fa377fb-5492-465e-a77e-a2447e6b20d4) on claude-fable-5.1 flagged the plant-shared premise, leftover throwaways, the inferred deploy SHA, the Kevin-password contradiction, the missing M8 test, the instance-level catalog test, the skipped quote-attachment probe, and one-sample claims. This revision answers those. The TSV still has reconstructed timestamps from commit time. Untracked local verify-oee360 evidence was not committed.
