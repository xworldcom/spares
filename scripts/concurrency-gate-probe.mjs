#!/usr/bin/env node
/**
 * Gate probe: 2 staff sessions, quote + ticket, four scenarios.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const baseUrl = process.env.OEE360_BASE_URL || "https://oee360.com";
const outDir = resolve(
  process.env.OEE360_EVIDENCE_DIR ||
    "/cursor/stores/self/media/staff-app/concurrency-migration",
);
mkdirSync(outDir, { recursive: true });

async function login(email, password) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const jar = (res.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(";")[0])
    .join("; ");
  return { ok: res.ok, jar };
}

async function json(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

async function main() {
  const staffA = await login("staff@demo.com", "demo123456");
  const staffB = await login("staff@demo.com", "demo123456");
  const customer = await login("user@demo.com", "demo123456");
  const result = {
    baseUrl,
    at: new Date().toISOString(),
    prodShaNote: "probe assumes production; ticket overlap fix needs deploy when on branch",
    ok: false,
    quote: null,
    ticket: null,
  };
  if (!staffA.ok || !staffB.ok || !customer.ok) {
    writeFileSync(`${outDir}/gate-probe.json`, JSON.stringify(result, null, 2));
    process.exit(1);
  }

  const tickets = await fetch(`${baseUrl}/api/tickets`, {
    headers: { cookie: staffA.jar },
  }).then((r) => r.json());
  const ticketId = tickets.tickets?.[0]?.id;
  const tDetail = ticketId
    ? await fetch(`${baseUrl}/api/tickets/${ticketId}`, {
        headers: { cookie: staffA.jar },
      }).then((r) => r.json())
    : null;
  let ticketSameField = [];
  let ticketBodies = [];
  let ticketAfter = null;
  if (ticketId) {
    const tFresh = await fetch(`${baseUrl}/api/tickets/${ticketId}`, {
      headers: { cookie: staffA.jar },
    }).then((r) => r.json());
    const tVersion = tFresh.ticket?.recordVersion ?? 1;
    ticketSameField = await Promise.all([
      fetch(`${baseUrl}/api/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { cookie: staffA.jar, "content-type": "application/json" },
        body: JSON.stringify({ recordVersion: tVersion, status: "in_progress" }),
      }),
      fetch(`${baseUrl}/api/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { cookie: staffB.jar, "content-type": "application/json" },
        body: JSON.stringify({ recordVersion: tVersion, status: "waiting_on_customer" }),
      }),
    ]);
    ticketBodies = await Promise.all(ticketSameField.map((r) => json(r)));
    ticketAfter = await fetch(`${baseUrl}/api/tickets/${ticketId}`, {
      headers: { cookie: staffA.jar },
    }).then((r) => r.json());
  }

  const quotes = await fetch(`${baseUrl}/api/quotes`, {
    headers: { cookie: staffA.jar },
  }).then((r) => r.json());
  const mergeQuoteId =
    quotes.quotes?.find((q) => q.id?.includes("stage-ordered"))?.id ??
    quotes.quotes?.find((q) => q.id?.includes("stage-shipped"))?.id ??
    quotes.quotes?.[0]?.id;
  const quoteId =
    quotes.quotes?.find((q) => q.id !== mergeQuoteId)?.id ?? quotes.quotes?.[0]?.id;
  const detail = quoteId
    ? await fetch(`${baseUrl}/api/quotes/${quoteId}`, {
        headers: { cookie: staffA.jar },
      }).then((r) => r.json())
    : null;
  const quote = detail?.quote;
  const qVersion = quote?.recordVersion ?? 1;

  const quoteSameField = await Promise.all([
    fetch(`${baseUrl}/api/quotes/${quoteId}`, {
      method: "PATCH",
      headers: { cookie: staffA.jar, "content-type": "application/json" },
      body: JSON.stringify({ recordVersion: qVersion, status: "pricing" }),
    }),
    fetch(`${baseUrl}/api/quotes/${quoteId}`, {
      method: "PATCH",
      headers: { cookie: staffB.jar, "content-type": "application/json" },
      body: JSON.stringify({ recordVersion: qVersion, status: "quoted" }),
    }),
  ]);
  const qBodies = await Promise.all(quoteSameField.map((r) => json(r)));
  const qAfter = await fetch(`${baseUrl}/api/quotes/${quoteId}`, {
    headers: { cookie: staffA.jar },
  }).then((r) => r.json());

  const mergeBase = await fetch(`${baseUrl}/api/quotes/${mergeQuoteId}`, {
    headers: { cookie: staffA.jar },
  }).then((r) => r.json());
  const mergeQuote = mergeBase.quote;
  const mergeVersion = mergeQuote?.recordVersion ?? 1;
  const gateSuffix = `gate-${Date.now()}`;
  const itemsForMerge = (mergeQuote?.items ?? []).map((row, idx) =>
    idx === 0 ? { ...row, qty: Math.max(1, (row.qty ?? 1)) } : row,
  );
  const existingShipments = mergeQuote?.shipments ?? [];
  const trackingBump = `1Z${String(gateSuffix).replace(/\D/g, "").slice(-10) || "999"}`;
  const shipmentsForMerge =
    existingShipments.length >= 8
      ? existingShipments.map((row, idx) =>
          idx === 0 ? { ...row, trackingNumber: trackingBump } : row,
        )
      : [
          ...existingShipments,
          {
            id: `draft-${gateSuffix}`,
            trackingNumber: trackingBump,
            carrier: "UPS",
          },
        ];
  const [diffFieldA, diffFieldB] = await Promise.all([
    fetch(`${baseUrl}/api/quotes/${mergeQuoteId}`, {
      method: "PATCH",
      headers: { cookie: staffA.jar, "content-type": "application/json" },
      body: JSON.stringify({
        recordVersion: mergeVersion,
        items: itemsForMerge,
      }),
    }),
    fetch(`${baseUrl}/api/quotes/${mergeQuoteId}`, {
      method: "PATCH",
      headers: { cookie: staffB.jar, "content-type": "application/json" },
      body: JSON.stringify({
        recordVersion: mergeVersion,
        shipments: shipmentsForMerge,
      }),
    }),
  ]);
  const diffBodyA = await json(diffFieldA);
  const diffBodyB = await json(diffFieldB);

  const conflictBody = qBodies.find((b) => b.code === "record-conflict");
  const ticketConflictBody = ticketBodies.find((b) => b.code === "record-conflict");
  result.quote = {
    id: quoteId,
    sameField: {
      statuses: quoteSameField.map((r) => r.status),
      conflictCount: quoteSameField.filter((r) => r.status === 409).length,
      successCount: quoteSameField.filter((r) => r.status === 200).length,
      writerName: conflictBody?.lastModifiedByName,
      conflictMessage: conflictBody?.error,
    },
    afterSameFieldVersion: qAfter.quote?.recordVersion,
    differentFields: {
      mergeQuoteId,
      itemsStatus: diffFieldA.status,
      shipmentsStatus: diffFieldB.status,
      itemsError: diffBodyA.error,
      shipmentsError: diffBodyB.error,
      bothOk: diffFieldA.ok && diffFieldB.ok,
    },
  };
  result.ticket = ticketId
    ? {
        id: ticketId,
        sameField: {
          statuses: ticketSameField.map((r) => r.status),
          conflictCount: ticketSameField.filter((r) => r.status === 409).length,
          successCount: ticketSameField.filter((r) => r.status === 200).length,
          writerName: ticketConflictBody?.lastModifiedByName,
          conflictMessage: ticketConflictBody?.error,
        },
        finalStatus: ticketAfter?.ticket?.status,
      }
    : { skipped: "no ticket" };

  const quoteSameOk =
    result.quote.sameField.successCount === 1 &&
    result.quote.sameField.conflictCount === 1 &&
    Boolean(result.quote.sameField.writerName);
  const quoteDiffOk = result.quote.differentFields.bothOk === true;
  const ticketOk =
    !ticketId ||
    (result.ticket.sameField.successCount === 1 &&
      result.ticket.sameField.conflictCount === 1 &&
      Boolean(result.ticket.sameField.writerName));
  result.scenarios = {
    quoteSameField: quoteSameOk,
    quoteDifferentFields: quoteDiffOk,
    ticketSameField: ticketOk,
    customerLogin: customer.ok,
  };
  result.ok = quoteSameOk && quoteDiffOk && ticketOk && customer.ok;

  writeFileSync(`${outDir}/gate-probe.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
