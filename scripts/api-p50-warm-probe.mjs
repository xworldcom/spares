#!/usr/bin/env node
/**
 * Warm API latency probe (p50/p95) for list routes.
 * Env: OEE360_BASE_URL, OEE360_PROBE_LABEL, OEE360_EVIDENCE_DIR, OEE360_DEPLOY_SHA, OEE360_DEPLOY_ID
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const baseUrl = process.env.OEE360_BASE_URL || "https://oee360.com";
const label = process.env.OEE360_PROBE_LABEL || "probe";
const deploySha = process.env.OEE360_DEPLOY_SHA || null;
const deployId = process.env.OEE360_DEPLOY_ID || null;
const outDir = resolve(
  process.env.OEE360_EVIDENCE_DIR ||
    "/cursor/stores/bc-7479d24f-d92e-51f0-ab53-0ec629d66015/media/staff-app/api-p50-2026-10-11",
);
mkdirSync(outDir, { recursive: true });

function percentile(samples, p) {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

const p50 = (samples) => percentile(samples, 50);
const p95 = (samples) => percentile(samples, 95);

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

async function probeEndpoint(jar, ep) {
  const coldHeaders = { cookie: jar, "cache-control": "no-cache" };
  const tCold = performance.now();
  const coldRes = await fetch(`${baseUrl}${ep}`, { headers: coldHeaders });
  await coldRes.arrayBuffer();
  const coldMs = Math.round(performance.now() - tCold);
  const etag = coldRes.headers.get("etag");

  const warm200 = [];
  for (let i = 0; i < 8; i++) {
    const t0 = performance.now();
    const res = await fetch(`${baseUrl}${ep}`, { headers: { cookie: jar } });
    await res.arrayBuffer();
    warm200.push(Math.round(performance.now() - t0));
  }

  const warm304 = [];
  if (etag) {
    for (let i = 0; i < 8; i++) {
      const t0 = performance.now();
      const res = await fetch(`${baseUrl}${ep}`, {
        headers: { cookie: jar, "if-none-match": etag },
      });
      await res.arrayBuffer();
      warm304.push(Math.round(performance.now() - t0));
    }
  }

  return {
    coldMs,
    etag,
    warm200: { p50: p50(warm200), p95: p95(warm200), samples: warm200 },
    warm304: { p50: p50(warm304), p95: p95(warm304), samples: warm304 },
  };
}

async function main() {
  const gateMs = 300;
  const result = {
    baseUrl,
    label,
    deploySha,
    deployId,
    at: new Date().toISOString(),
    method:
      "POST /api/auth/login (staff@demo.com); per endpoint: 1 cold GET, 8 warm GET (200), 8 warm GET with If-None-Match (304). Latencies from fetch wall clock (ms). p50/p95 of warm samples.",
    loginMs: null,
    gateMs,
    apis: {},
    ok: true,
  };

  const { loginMs, jar } = await loginJar();
  result.loginMs = loginMs;

  for (const ep of ["/api/machines", "/api/quotes", "/api/tickets"]) {
    result.apis[ep] = await probeEndpoint(jar, ep);
    const row = result.apis[ep];
    if (row.warm200.p50 > gateMs || row.warm304.p50 > gateMs) {
      result.ok = false;
    }
  }

  const outFile = `${outDir}/warm-api-${label}.json`;
  writeFileSync(outFile, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
