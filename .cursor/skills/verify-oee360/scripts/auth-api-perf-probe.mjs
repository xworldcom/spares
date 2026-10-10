#!/usr/bin/env node
/**
 * Auth API latency probe (staff session).
 * Env: OEE360_BASE_URL, OEE360_EVIDENCE_DIR
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const baseUrl = process.env.OEE360_BASE_URL || "https://oee360.com";
const outDir = resolve(
  process.env.OEE360_EVIDENCE_DIR ||
    "/cursor/stores/bc-7479d24f-d92e-51f0-ab53-0ec629d66015/media/staff-app/auth-api-perf",
);
mkdirSync(outDir, { recursive: true });

const result = { baseUrl, at: new Date().toISOString(), loginMs: null, endpoints: {}, quoteDetailMs: null, ok: true };

async function login(request) {
  const t0 = performance.now();
  const res = await request.post(`${baseUrl}/api/auth/login`, {
    data: { email: "staff@demo.com", password: "demo123456" },
  });
  result.loginMs = Math.round(performance.now() - t0);
  return res.ok();
}

const browser = await (await import("playwright")).chromium.launch({ headless: true });
const ctx = await browser.newContext();
if (!(await login(ctx.request))) {
  result.ok = false;
  writeFileSync(`${outDir}/timings.json`, JSON.stringify(result, null, 2));
  process.exit(1);
}

for (const ep of ["/api/machines", "/api/quotes", "/api/tickets"]) {
  const samples = [];
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    const res = await ctx.request.get(`${baseUrl}${ep}`);
    await res.body();
    samples.push({ ms: Math.round(performance.now() - t0), status: res.status() });
  }
  result.endpoints[ep] = samples;
}

const q0 = performance.now();
const qRes = await ctx.request.get(`${baseUrl}/api/quotes/2`);
await qRes.body();
result.quoteDetailMs = Math.round(performance.now() - q0);

await browser.close();

const p50 = (arr) => {
  const sorted = [...arr].map((r) => r.ms).sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};
for (const ep of Object.keys(result.endpoints)) {
  if (p50(result.endpoints[ep]) > 300) {
    result.ok = false;
  }
}
if (result.loginMs > 300) {
  result.ok = false;
}
if (result.quoteDetailMs > 2000) {
  result.ok = false;
}

writeFileSync(`${outDir}/timings.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
