# rv421 Mac proof — harness hints (fold into `~/spares-gate/scripts/rv421-*`)

## Item 8 — `/machines/hardware-fixture`

Staff **View part** links render in the 3D chrome when the machine has announced/obsolete lifecycle parts (no BOM row select required). Harness may still click a part first to assert the chip link.

## Item 7 @1440

Messages use **phone overlay snap** (`.snap-sheet-handle` visible) below **1536px** width. Open Messages (peek/reply) before Close assertions.

## sam-close-ticket9 @390

Use hub path **`/care/tickets/{id}`** (not machine-scoped). Harness: `node scripts/rv421-sam-close-ticket9.mjs`.

Care ticket detail uses overlay snap below 1536px; confirm viewport width before querying `.snap-sheet-handle`.

## Item 5 — `document.title` (staff lists)

- **`/staff/quotes`:** SSR `metadata.title: "Quotes"` + `DocumentTitle`; expect `Quotes · OEE360`.
- **`/staff/tickets`** (redirects to hub): SSR `metadata.title: "All tickets"` on staff + `/care/tickets` layout; `DocumentTitle` outside Suspense. WebKit @390: wait for `All tickets · OEE360`, not bare `OEE360`.
