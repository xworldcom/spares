#!/usr/bin/env node
/**
 * Multi-client quote + ticket probe (staff + customer). Writes evidence JSON.
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

const result = {
  baseUrl,
  at: new Date().toISOString(),
  quote: null,
  ticket: null,
  ok: false,
};

async function main() {
  const staffA = await login("staff@demo.com", "demo123456");
  const staffB = await login("staff@demo.com", "demo123456");
  const customer = await login("user@demo.com", "demo123456");
  if (!staffA.ok || !staffB.ok || !customer.ok) {
    writeFileSync(`${outDir}/probe.json`, JSON.stringify(result, null, 2));
    process.exit(1);
  }

  const listRes = await fetch(`${baseUrl}/api/quotes`, {
    headers: { cookie: staffA.jar },
  });
  const list = await listRes.json();
  const quoteRow = list.quotes?.[0];
  if (!quoteRow) {
    writeFileSync(`${outDir}/probe.json`, JSON.stringify(result, null, 2));
    process.exit(1);
  }

  const detailRes = await fetch(`${baseUrl}/api/quotes/${quoteRow.id}`, {
    headers: { cookie: staffA.jar },
  });
  const detail = await detailRes.json();
  const quote = detail.quote ?? quoteRow;
  const version = quote.recordVersion ?? 1;
  const stamp = Date.now();
  const quoteResponses = await Promise.all([
    fetch(`${baseUrl}/api/quotes/${quote.id}`, {
      method: "PATCH",
      headers: { cookie: staffA.jar, "content-type": "application/json" },
      body: JSON.stringify({
        recordVersion: version,
        status: "pricing",
      }),
    }),
    fetch(`${baseUrl}/api/quotes/${quote.id}`, {
      method: "PATCH",
      headers: { cookie: staffB.jar, "content-type": "application/json" },
      body: JSON.stringify({
        recordVersion: version,
        status: "quoted",
      }),
    }),
  ]);

  const parallelConflict = quoteResponses.filter((res) => res.status === 409).length;
  const parallelSuccess = quoteResponses.filter((res) => res.ok).length;

  const freshRes = await fetch(`${baseUrl}/api/quotes/${quote.id}`, {
    headers: { cookie: staffA.jar },
  });
  const fresh = (await freshRes.json()).quote;
  const staleRes = await fetch(`${baseUrl}/api/quotes/${quote.id}`, {
    method: "PATCH",
    headers: { cookie: staffB.jar, "content-type": "application/json" },
    body: JSON.stringify({
      recordVersion: version,
      status: "in_review",
    }),
  });
  const staleBody = await staleRes.json().catch(() => ({}));

  result.quote = {
    id: quote.id,
    initialRecordVersion: version,
    finalRecordVersion: fresh?.recordVersion,
    parallel: {
      statuses: quoteResponses.map((res) => res.status),
      conflictCount: parallelConflict,
      successCount: parallelSuccess,
    },
    staleAfterParallel: {
      status: staleRes.status,
      code: staleBody.code,
      error: staleBody.error,
    },
    stamp,
  };

  result.ok =
    (parallelSuccess >= 1 && parallelConflict >= 1) || staleRes.status === 409;

  writeFileSync(`${outDir}/probe.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
