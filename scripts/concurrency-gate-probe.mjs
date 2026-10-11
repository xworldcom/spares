#!/usr/bin/env node
/**
 * Gate probe: 2 staff + customer, quote + ticket, same-field 409 + different-field merge.
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
    ok: false,
    quote: null,
    ticket: null,
  };
  if (!staffA.ok || !staffB.ok || !customer.ok) {
    writeFileSync(`${outDir}/gate-probe.json`, JSON.stringify(result, null, 2));
    process.exit(1);
  }

  const quotes = await fetch(`${baseUrl}/api/quotes`, {
    headers: { cookie: staffA.jar },
  }).then((r) => r.json());
  const quoteId = quotes.quotes?.[0]?.id;
  const detail = quoteId
    ? await fetch(`${baseUrl}/api/quotes/${quoteId}`, {
        headers: { cookie: staffA.jar },
      }).then((r) => r.json())
    : null;
  const quote = detail?.quote;
  const qVersion = quote?.recordVersion ?? 1;

  const tickets = await fetch(`${baseUrl}/api/tickets`, {
    headers: { cookie: staffA.jar },
  }).then((r) => r.json());
  const ticketId = tickets.tickets?.[0]?.id;
  const tDetail = ticketId
    ? await fetch(`${baseUrl}/api/tickets/${ticketId}`, {
        headers: { cookie: staffA.jar },
      }).then((r) => r.json())
    : null;
  const ticket = tDetail?.ticket;
  const tVersion = ticket?.recordVersion ?? 1;

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

  const freshQ = qAfter.quote;
  const noteSuffix = `gate-${Date.now()}`;
  const diffFieldA = await fetch(`${baseUrl}/api/quotes/${quoteId}`, {
    method: "PATCH",
    headers: { cookie: staffA.jar, "content-type": "application/json" },
    body: JSON.stringify({
      recordVersion: freshQ?.recordVersion,
      invoiceNumber: `INV-${noteSuffix}-A`,
    }),
  });
  const diffFieldB = await fetch(`${baseUrl}/api/quotes/${quoteId}`, {
    method: "PATCH",
    headers: { cookie: staffB.jar, "content-type": "application/json" },
    body: JSON.stringify({
      recordVersion: freshQ?.recordVersion,
      shipments: freshQ?.shipments ?? [],
    }),
  });

  let ticketSameField = [];
  let ticketBodies = [];
  let ticketAfter = null;
  if (ticketId) {
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

  const conflictBody = qBodies.find((b) => b.code === "record-conflict");
  result.quote = {
    id: quoteId,
    sameField: {
      statuses: quoteSameField.map((r) => r.status),
      conflictCount: quoteSameField.filter((r) => r.status === 409).length,
      successCount: quoteSameField.filter((r) => r.ok).length,
      writerName: conflictBody?.lastModifiedByName,
      conflictMessage: conflictBody?.error,
    },
    afterSameFieldVersion: freshQ?.recordVersion,
    differentFields: {
      invoiceStatus: diffFieldA.status,
      shipmentsStatus: diffFieldB.status,
    },
  };
  result.ticket = ticketId
    ? {
        id: ticketId,
        sameField: {
          statuses: ticketSameField.map((r) => r.status),
          conflictCount: ticketSameField.filter((r) => r.status === 409).length,
          successCount: ticketSameField.filter((r) => r.ok).length,
        },
        finalStatus: ticketAfter?.ticket?.status,
      }
    : { skipped: "no ticket" };

  const quoteOk =
    result.quote.sameField.successCount === 1 &&
    result.quote.sameField.conflictCount === 1 &&
    Boolean(result.quote.sameField.writerName);
  const ticketOk =
    !ticketId ||
    (result.ticket.sameField.successCount === 1 &&
      result.ticket.sameField.conflictCount === 1);
  result.ok = quoteOk && ticketOk;

  writeFileSync(`${outDir}/gate-probe.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
