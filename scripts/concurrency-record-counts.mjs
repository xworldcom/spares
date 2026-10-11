#!/usr/bin/env node
/**
 * API-derived record counts (quotes, tickets, lifecycle rows visible to staff).
 * Env: OEE360_BASE_URL, OEE360_EVIDENCE_DIR
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const baseUrl = process.env.OEE360_BASE_URL || "https://oee360.com";
const outDir = resolve(
  process.env.OEE360_EVIDENCE_DIR ||
    "/cursor/stores/self/media/staff-app/concurrency-migration",
);
mkdirSync(outDir, { recursive: true });
const label = process.env.OEE360_COUNT_LABEL || "counts";

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

async function main() {
  const staff = await login("staff@demo.com", "demo123456");
  const customer = await login("user@demo.com", "demo123456");
  const result = {
    baseUrl,
    at: new Date().toISOString(),
    label,
    staffOk: staff.ok,
    customerOk: customer.ok,
    counts: {},
  };
  if (!staff.ok) {
    writeFileSync(`${outDir}/${label}.json`, JSON.stringify(result, null, 2));
    process.exit(1);
  }
  const [quotes, tickets, lifecycle] = await Promise.all([
    fetch(`${baseUrl}/api/quotes`, { headers: { cookie: staff.jar } }).then((r) => r.json()),
    fetch(`${baseUrl}/api/tickets`, { headers: { cookie: staff.jar } }).then((r) => r.json()),
    fetch(`${baseUrl}/api/staff/part-lifecycle`, { headers: { cookie: staff.jar } }).then((r) =>
      r.json(),
    ),
  ]);
  result.counts = {
    quotes: quotes.quotes?.length ?? 0,
    tickets: tickets.tickets?.length ?? 0,
    lifecycleParts: lifecycle.parts?.length ?? 0,
    unreadQuotes: quotes.unreadCount ?? 0,
  };
  if (customer.ok) {
    const cq = await fetch(`${baseUrl}/api/quotes`, {
      headers: { cookie: customer.jar },
    }).then((r) => r.json());
    result.counts.customerQuotes = cq.quotes?.length ?? 0;
  }
  writeFileSync(`${outDir}/${label}.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
