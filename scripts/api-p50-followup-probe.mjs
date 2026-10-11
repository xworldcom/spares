#!/usr/bin/env node
/**
 * API p50 follow-up gate: warm 200/304 for machines, quotes, tickets (p50 < 300ms).
 * Evidence: media/staff-app/api-p50-followup/timings-{before,after}.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const baseUrl = process.env.OEE360_BASE_URL || "https://oee360.com";
const label = process.env.OEE360_PROBE_LABEL || "after";
const outDir = resolve(
  process.env.OEE360_EVIDENCE_DIR ||
    "/cursor/stores/bc-7479d24f-d92e-51f0-ab53-0ec629d66015/media/staff-app/api-p50-followup",
);
mkdirSync(outDir, { recursive: true });

function p50(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

async function loginJar() {
  const loginStart = performance.now();
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "staff@demo.com", password: "demo123456" }),
  });
  const loginMs = Math.round(performance.now() - loginStart);
  const jar = (login.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(";")[0])
    .join("; ");
  if (!login.ok) {
    throw new Error(`login failed ${login.status}`);
  }
  return { loginMs, jar };
}

async function probeApis(jar) {
  const endpoints = {};
  for (const ep of ["/api/machines", "/api/quotes", "/api/tickets"]) {
    const coldHeaders = { cookie: jar, "cache-control": "no-cache" };
    const tCold = performance.now();
    const coldRes = await fetch(`${baseUrl}${ep}`, { headers: coldHeaders });
    const coldBody = await coldRes.arrayBuffer();
    const coldMs = Math.round(performance.now() - tCold);
    const etag = coldRes.headers.get("etag");

    const warm200 = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      const res = await fetch(`${baseUrl}${ep}`, { headers: { cookie: jar } });
      await res.arrayBuffer();
      warm200.push(Math.round(performance.now() - t0));
    }

    const warm304 = [];
    if (etag) {
      for (let i = 0; i < 5; i++) {
        const t0 = performance.now();
        const res = await fetch(`${baseUrl}${ep}`, {
          headers: { cookie: jar, "if-none-match": etag },
        });
        await res.arrayBuffer();
        warm304.push(Math.round(performance.now() - t0));
      }
    }

    endpoints[ep] = {
      cold: { ms: coldMs, status: coldRes.status, bytes: coldBody.byteLength, etag },
      warm200: { p50: p50(warm200), samples: warm200 },
      warm304: { p50: p50(warm304.map((s) => s)), samples: warm304 },
    };
  }
  return endpoints;
}

async function main() {
  const result = {
    baseUrl,
    label,
    at: new Date().toISOString(),
    loginMs: null,
    apis: null,
    gateMs: 300,
    ok: true,
  };

  const { loginMs, jar } = await loginJar();
  result.loginMs = loginMs;
  result.apis = await probeApis(jar);

  for (const ep of Object.keys(result.apis)) {
    const row = result.apis[ep];
    if (row.warm200.p50 > result.gateMs) result.ok = false;
    if (row.warm304.p50 > result.gateMs) result.ok = false;
  }

  const outFile = `${outDir}/timings-${label}.json`;
  writeFileSync(outFile, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
