#!/usr/bin/env node
/**
 * Measures quote detail API + UI thread readiness (staff).
 * Usage: node quotes-q2-perf-probe.mjs
 * Env: OEE360_BASE_URL, OEE360_QUOTE_REF (default 2), OEE360_EVIDENCE_DIR
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.OEE360_BASE_URL || "https://oee360.com";
const quoteRef = process.env.OEE360_QUOTE_REF || "2";
const outDir = resolve(
  process.env.OEE360_EVIDENCE_DIR ||
    "/cursor/stores/bc-7479d24f-d92e-51f0-ab53-0ec629d66015/media/staff-app/quotes-q2-perf",
);
mkdirSync(outDir, { recursive: true });

const result = {
  baseUrl,
  quoteRef,
  at: new Date().toISOString(),
  apiMs: null,
  apiBytes: null,
  activityCount: null,
  viewports: [],
  demoStageNotes: {},
  ok: true,
};

async function login(request, email, password) {
  const res = await request.post(`${baseUrl}/api/auth/login`, {
    data: { email, password },
  });
  return res.ok();
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
await login(ctx.request, "staff@demo.com", "demo123456");

const apiStart = performance.now();
const apiRes = await ctx.request.get(`${baseUrl}/api/quotes/${quoteRef}`);
const apiBody = await apiRes.text();
result.apiMs = Math.round(performance.now() - apiStart);
result.apiBytes = apiBody.length;
try {
  const parsed = JSON.parse(apiBody);
  result.activityCount = parsed.quote?.activities?.length ?? null;
} catch {
  result.ok = false;
}

async function viewportProbe(width, height, label) {
  const page = await ctx.newPage();
  await page.setViewportSize({ width, height });
  const navStart = performance.now();
  await page.goto(`${baseUrl}/staff/quotes/${quoteRef}`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await page.locator("h1").first().waitFor({ timeout: 120000 });
  const h1Ms = Math.round(performance.now() - navStart);
  let threadMs = null;
  try {
    await page
      .locator(".imsg-thread .imsg-row, .imsg-thread .imsg-system")
      .first()
      .waitFor({ timeout: 5000 });
    threadMs = Math.round(performance.now() - navStart);
  } catch {
    threadMs = null;
    result.ok = false;
  }
  await page.screenshot({ path: `${outDir}/${label}-quote-${quoteRef}.png` });
  await page.close();
  return { label, width, h1Ms, threadMs };
}

result.viewports.push(await viewportProbe(390, 844, "390"));
result.viewports.push(await viewportProbe(1440, 900, "1440"));

const listPage = await ctx.newPage();
await listPage.setViewportSize({ width: 1440, height: 900 });
await listPage.goto(`${baseUrl}/staff/quotes`, { waitUntil: "domcontentloaded" });
await listPage.waitForTimeout(1500);
result.demoStageNotes = await listPage.evaluate(() => ({
  po: /Demo verify — PO received/.test(document.body.innerText),
  confirmed: /Demo verify — Confirmed/.test(document.body.innerText),
  ordered: /Demo verify — Ordered/.test(document.body.innerText),
  shipped: /Demo verify — Shipped/.test(document.body.innerText),
}));
await listPage.screenshot({ path: `${outDir}/1440-quotes-list.png` });
await listPage.close();

await browser.close();

for (const row of result.viewports) {
  if (row.threadMs == null || row.threadMs > 2000) {
    result.ok = false;
  }
}
if (result.apiMs > 2000) {
  result.ok = false;
}

writeFileSync(`${outDir}/timings.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
