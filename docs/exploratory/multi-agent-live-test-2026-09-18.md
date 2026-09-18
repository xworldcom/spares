# Multi-agent live test (18 Sep 2026)

Four people used Production `https://oee360.com` at the same time. Two staff and two customers were created from a live host-staff Directory session, then signed in together and used the product the way their role would.

This is a findings list, not a redesign. Quotes stay isolated. Staff APIs stay staff-only. Demo seeds stay blocked. The site is **not** ultra-easy, and Production still looks like a QA junk drawer.

Evidence screenshots: [evidence/multiagent-20260918/](./evidence/multiagent-20260918/).

## How it ran

| Role | Who | How they got in |
| --- | --- | --- |
| Creator (host staff) | `pr139-smoke-20260915-2316@spares.test` | Existing leftover. Signed into Directory and created the four people. |
| Staff A | Jamie Cole — `jamie.cole.ma0918@spares.test` | Directory → Staff → New staff |
| Staff B | Riley Cho — `riley.cho.ma0918@spares.test` | Directory → Staff → New staff (first-day persona) |
| Customer A | Pat Nguyen — `pat.nguyen.ma0918@spares.test` | Directory → People → New person. Fort Madison / Hardware fixture. |
| Customer B | Lee Martinez — `lee.martinez.ma0918@spares.test` | Directory → People → New person. Fort Worth / Palletizer. |

All four sessions were live at once (Playwright, isolated profiles) plus a concurrent API isolation probe.

Passwords are not in this document.

## What held

- Password login works for newly created staff and people. Demo `staff@spares.local` still 401s on Production.
- Customers cannot open `/staff/*`, `/machines/new`, or staff APIs (`403` / Wrong role).
- Lee cannot open Hardware fixture (`404` on page and `GET /api/machines/hardware-fixture`).
- Lee cannot read Pat’s or Acme quotes (`403` on `/quotes/2`, `/quotes/3`, `/quotes/7`).
- `POST /api/staff/customers` with `role: "staff"` still creates a **customer**. Server ignores the client role.
- Foreign `Origin` on `POST /api/auth/login` returns **403**.
- `/login?email=&password=` strips the password from the URL. Email can linger (`/login?email=pat`).
- Stored `<script>alert(1)</script>` renders as text. It does not execute.

## Verdict

**Security (authz):** Quotes, machines, and staff routes are in good shape for a two-customer / two-staff host. Care is still **machine-shared**, so a new Cargill operator can read and write Kevin’s and crawl leftover threads. Logout does not revoke the JWT.

**Usability:** Not ultra-easy. A first-day staffer lands on six Quinn-ML leftovers, cannot open a staff profile, and will hit **New Customer** (company name) when they meant **New Person** (login). A Fort Madison buyer inherits every machine on that site, including QA leftovers. Quote chat can loop the request note and cover the pricing form.

## Findings

### Security / isolation

| Sev | What | Why it matters |
| --- | --- | --- |
| High | Any customer who can open a machine can list, read, and write **every Care ticket on that machine**. Pat opened Kevin’s ticket 4 and posted. Lee opened crawl ticket 5 and posted. Riley (staff) then replied on that same leftover thread. | Feels like a leak to a plant buyer. Product-intent from the 16 Sep review, but it is still the opposite of “my tickets.” |
| Medium | Ticket JSON includes `attachment.r2Key` (`chat/chat-….jpg`) for customers. | Storage paths do not belong in a customer payload. |
| Medium | `POST /api/auth/logout` clears the cookie. Replaying the old `spares_session` value still returns `200` on `GET /api/auth/me`. | Stolen token after “Sign out” stays valid until expiry. Known from the 16 Sep review; still true on Production. |
| Low | Two staff `PATCH` the same quote at once: both `200`. Last write wins. No `409` / ETag. | Jamie and Riley both flipped quote 9 (`in_review` vs `pricing`). Activity log becomes Requested → Pricing → In review noise. |

### Create-account flow (the staff login test)

Creating the four people **was** the test. It works, but it is easy to do the wrong thing.

| Sev | What | Why it matters |
| --- | --- | --- |
| Major | **New Customer** is a company name. **New Person** is the login. **New Staff** is the staff login. First-day path is Directory → Customers → New customer (wrong) → People → New Person (right). Four tabs. | Riley almost created a nameless company. This will happen to real staff. |
| Major | People tab dumps **every person as an open editor** (Name / Email / Access / Remove) under the create form. Access checkboxes for Fort Madison / Fort Worth appear many times. | The create script could not tick “Fort Madison” without hitting other people’s editors. Pat and Lee were created **with no site or machine**. A real staffer will do the same. |
| Major | Granting a **site** gives every machine on that site. Pat was later given Fort Madison and immediately saw Hardware fixture **plus** three Quinn-ML quote leftovers. Explicit `machineIds` on PATCH did not stay as “only Hardware fixture.” | You cannot give a buyer one machine at a plant that also has QA leftovers. |
| Major | Staff create has **no name field**. Directory search for “Jamie Cole” misses Jamie. Staff rows are **not links**. `/staff/directory/{staffId}` says Person not found. Copy says “Open any row to view or edit.” | Staff cannot edit their own login. Coworkers are a dead email list (`staff@spares.local`, `staff@demo.com`, crawl leftovers). |
| UX | All tab has **no create action** and sits on “Loading directory…” long enough that search returns empty. | New staffer cannot add anyone from the first Directory screen. |
| UX | Staff tab helper still says “not the demo `staff@spares.local` account” while listing that account. | Demo leftovers are still first-class Directory rows on Production. |

### Using the product (customers)

| Sev | What | Why it matters |
| --- | --- | --- |
| UX | Pat’s Machines list is Hardware fixture + Quinn-ML-Quote-244b481 / 8a56c62 / 8a56c62-prod (`No 3D`). Mobile truncates names to `Quinn-ML-Q…`. | A real buyer should not see QA machines. |
| UX | Request quote can stick on **Sending…** after the quote already exists. Double-click did not duplicate (good) but never showed a clear “sent” state. | Pat created quote 9 (`7a971f9c-…`) and had to leave the page to believe it. |
| UX | Care / quote routes flash **Checking your session…** / **Loading…** for 2–4s. Quote 2 and 7 eventually settle on Forbidden — correct, but slow and blank first. | Feels broken before it feels secure. |
| Nit | Quote chat accepts a much longer message than Care (Care caps at 2000). XSS stays text. | Inconsistent, not a script execution bug. |

### Using the product (staff)

| Sev | What | Why it matters |
| --- | --- | --- |
| Major | Model-less Quinn-ML detail stays on **Loading machine…** for 25s+ with no empty state, no upload, no Care. API returns 200 / `hasModel: false`. | Staff cannot recover a leftover machine from the detail page. |
| Major | Quote conversation sheet covers **Save pricing** on desktop. Jamie had to force-click. Collapse handle is easy to miss. | Staff cannot price a line without fighting the chat overlay. |
| Major | Quote 9 chat repeated Pat’s request note in one balloon many times (`Need bearings for line 3 — multiagent-0918 Pat` looped). | Looks like a send/echo bug, not a customer who typed it 20 times. |
| UX | `/quotes` as staff: **Wrong role. This page is for customers only.** Staff quotes live at `/staff/quotes`. | First-day staff who type “quotes” in the URL get scolded. |
| UX | Quote status is a row of free chips. Tracking is offered before shipped. Invoice copy says it opens after PO — no invoice field on requested quotes. | Easy to click the pipeline by accident. |
| UX | Palletizer Service form opened with leftover crawl notes already in the box. | First-day staff will save on top of invented crawl text. |
| UX | Mobile tab bar overlays cards. Quote conversation fights invoice / tracking / tabs. Directory and Bugs sit behind **More**. | Usable, not clean. |
| UX | First login is a dump of 8 machines, Care badge 7, Quotes badge 9, customer-ish subcopy (“Inspect a model, open Care, or request a quote”). No “you are staff” and no “start here.” | Riley’s first-minute gut: “I do not know what my job is.” |

## Concurrent story (what the four people actually did)

1. Creator added Jamie, Riley, Pat, and Lee from Directory.
2. Pat opened Hardware fixture, picked hex screw `91280A340`, requested quote 9.
3. Lee opened Palletizer only, requested quote 8 (`Palletizer belt worn — multiagent-0918 Lee`), then read and wrote crawl ticket 5.
4. Jamie found quote 9, posted in chat, raced status PATCHes, logged a Palletizer service visit, and confirmed platform routes 403.
5. Riley hunted for “add a customer login,” found Lee’s profile, opened quote 8, and replied on ticket 5 after Lee’s check-in.

They were all signed in on Production at the same time.

## Side effects still on Production

Deactivate when convenient. Do not deactivate protected demos.

- New staff: `jamie.cole.ma0918@spares.test`, `riley.cho.ma0918@spares.test`, plus earlier `multiagent-staff-20260918@spares.test`
- New people: `pat.nguyen.ma0918@spares.test`, `lee.martinez.ma0918@spares.test`
- Role-probe leftovers: `jamie-role-probe.*@spares.test`, `role-escape.ma0918@spares.test` (customer role, no machines)
- Quote 8 (Lee, Palletizer) and quote 9 (Pat, Hardware fixture) plus chat / XSS-as-text on quote 9
- Notes on Care ticket 4 (Kevin / Hardware) and ticket 5 (crawl Palletizer)
- Palletizer service visit dated 2026-09-18 from Jamie

Older crawl throwaways (`pr139-smoke-*`, `crawl-20260916-*`, `staff@demo.com`) are still in Directory.

## What to fix first if the bar is “bulletproof + ultra easy”

1. **Directory nouns.** One create path: “Add a login” vs “Add a company.” Do not put every person in an open editor under the create form.
2. **Sweep Production QA leftovers.** Quinn-ML machines, crawl people, demo staff rows, isolation tickets. A first-day staffer should see two real machines.
3. **Staff profiles.** Name on create. Rows that open. Search by name.
4. **Quote sheet vs pricing.** Chat cannot eat Save pricing. Request notes must not loop.
5. **Model-less machines.** Empty state + attach pack, never infinite Loading.
6. **Care sharing.** If plant-shared is the product, say “shared with everyone on this machine” on the list. If not, filter by `customerId` the way quotes do.
7. **Logout.** Server-side session version or denylist if stolen JWT after logout matters.
8. **Site grants.** Granting Fort Madison should not silently include every leftover machine on that site — or those leftovers should not live on a real customer site.
