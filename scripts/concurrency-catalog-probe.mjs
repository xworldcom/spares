#!/usr/bin/env node
/**
 * Parallel quote mutations against a deployed host (preview or prod).
 * Env: OEE360_BASE_URL, OEE360_EVIDENCE_DIR, OEE360_QUOTE_ID (optional)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const baseUrl = process.env.OEE360_BASE_URL || "https://oee360.com";
const outDir = resolve(
  process.env.OEE360_EVIDENCE_DIR ||
    "/cursor/stores/bc-7479d24f-d92e-51f0-ab53-0ec629d66015/media/staff-app/concurrency-test",
);
mkdirSync(outDir, { recursive: true });

const result = {
  baseUrl,
  at: new Date().toISOString(),
  loginOk: false,
  quoteId: null,
  parallel: null,
  ok: false,
};

async function main() {
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "staff@demo.com", password: "demo123456" }),
  });
  result.loginOk = loginRes.ok;
  const jar = (loginRes.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(";")[0])
    .join("; ");
  if (!result.loginOk) {
    writeFileSync(`${outDir}/probe-before-merge.json`, JSON.stringify(result, null, 2));
    process.exit(1);
  }

  const listRes = await fetch(`${baseUrl}/api/quotes`, { headers: { cookie: jar } });
  const list = await listRes.json();
  const quote =
    list.quotes?.find((row) => row.number === 2) ?? list.quotes?.[0] ?? null;
  if (!quote) {
    writeFileSync(`${outDir}/probe.json`, JSON.stringify(result, null, 2));
    process.exit(1);
  }
  result.quoteId = quote.id;

  const stamp = Date.now();
  const bodies = [
    { note: `probe-a-${stamp}` },
    { note: `probe-b-${stamp}` },
  ];

  const started = performance.now();
  const responses = await Promise.all(
    bodies.map((body) =>
      fetch(`${baseUrl}/api/quotes/${quote.id}`, {
        method: "PATCH",
        headers: { cookie: jar, "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    ),
  );
  const elapsedMs = Math.round(performance.now() - started);

  const detail = await fetch(`${baseUrl}/api/quotes/${quote.id}`, { headers: { cookie: jar } });
  const detailJson = await detail.json();
  const note = detailJson.quote?.note ?? "";

  result.parallel = {
    elapsedMs,
    statuses: responses.map((res) => res.status),
    conflictCount: responses.filter((res) => res.status === 409).length,
    successCount: responses.filter((res) => res.ok).length,
    finalNote: note,
    bothProbesPresent:
      note.includes(`probe-a-${stamp}`) || note.includes(`probe-b-${stamp}`),
    noSilentBlank: note.length > 0,
  };

  result.ok =
    result.parallel.successCount >= 1 &&
    result.parallel.noSilentBlank &&
    result.parallel.conflictCount <= 1;

  writeFileSync(`${outDir}/probe-before-merge.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
