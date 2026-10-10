#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const baseUrl = process.env.OEE360_BASE_URL || "https://oee360.com";
const outDir = resolve(
  process.env.OEE360_EVIDENCE_DIR ||
    "/cursor/stores/bc-7479d24f-d92e-51f0-ab53-0ec629d66015/media/staff-app/auth-api-perf",
);
mkdirSync(outDir, { recursive: true });

const result = { baseUrl, at: new Date().toISOString(), loginMs: null, endpoints: {}, quoteDetailMs: null, ok: true };

function p50(samples) {
  const sorted = samples.map((r) => r.ms).sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function main() {
  const loginStart = performance.now();
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "staff@demo.com", password: "demo123456" }),
  });
  result.loginMs = Math.round(performance.now() - loginStart);
  const jar = (login.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(";")[0])
    .join("; ");
  if (!login.ok) {
    result.ok = false;
    writeFileSync(`${outDir}/timings.json`, JSON.stringify(result, null, 2));
    process.exit(1);
  }

  for (const ep of ["/api/machines", "/api/quotes", "/api/tickets"]) {
    const samples = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      const res = await fetch(`${baseUrl}${ep}`, { headers: { cookie: jar } });
      await res.arrayBuffer();
      samples.push({ ms: Math.round(performance.now() - t0), status: res.status });
    }
    result.endpoints[ep] = samples;
    if (p50(samples) > 300) {
      result.ok = false;
    }
  }

  const q0 = performance.now();
  const qRes = await fetch(`${baseUrl}/api/quotes/2`, { headers: { cookie: jar } });
  await qRes.arrayBuffer();
  result.quoteDetailMs = Math.round(performance.now() - q0);
  if (result.quoteDetailMs > 2000) {
    result.ok = false;
  }
  if (result.loginMs > 300) {
    result.ok = false;
  }

  writeFileSync(`${outDir}/timings-before-merge.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
