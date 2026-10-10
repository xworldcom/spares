#!/usr/bin/env node
/**
 * Prod/local: auth API p50 + staff tab switch (Machines → Quotes → Care) @390 & 1440.
 * Evidence: media/staff-app/list-tab-perf/timings.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.OEE360_BASE_URL || "https://oee360.com";
const outDir = resolve(
  process.env.OEE360_EVIDENCE_DIR ||
    "/cursor/stores/bc-7479d24f-d92e-51f0-ab53-0ec629d66015/media/staff-app/list-tab-perf",
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

async function probeApis(jar, label) {
  const endpoints = {};
  for (const ep of ["/api/machines", "/api/quotes", "/api/tickets"]) {
    const samples = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      const headers = { cookie: jar };
      if (label === "cold" && i === 0) {
        headers["cache-control"] = "no-cache";
        headers["pragma"] = "no-cache";
      }
      const res = await fetch(`${baseUrl}${ep}`, { headers });
      await res.arrayBuffer();
      samples.push({ ms: Math.round(performance.now() - t0), status: res.status, bytes: Number(res.headers.get("content-length") || 0) });
    }
    endpoints[ep] = { p50: p50(samples.map((s) => s.ms)), samples };
  }
  return endpoints;
}

async function tabSwitchMs(page, width) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`${baseUrl}/machines`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(400);

  const measureHop = async (selector) => {
    const t0 = performance.now();
    await page.click(selector);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForSelector("main", { timeout: 15_000 });
    return Math.round(performance.now() - t0);
  };

  const quotesSel =
    'a[href="/staff/quotes"], a[href="/quotes"], nav a:has-text("Quotes")';
  const careSel = 'a[href="/care"], nav a:has-text("Care")';
  const machinesSel = 'a[href="/machines"], nav a:has-text("Machines")';

  const toQuotes = await measureHop(quotesSel);
  const toCare = await measureHop(careSel);
  const toMachines = await measureHop(machinesSel);
  return { width, toQuotes, toCare, toMachines, max: Math.max(toQuotes, toCare, toMachines) };
}

async function main() {
  const result = {
    baseUrl,
    at: new Date().toISOString(),
    loginMs: null,
    apis: { warm: null, cold: null },
    tabSwitch: { warm: [], cold: [] },
    ok: true,
  };

  const { loginMs, jar } = await loginJar();
  result.loginMs = loginMs;

  result.apis.warm = await probeApis(jar, "warm");
  result.apis.cold = await probeApis(jar, "cold");

  for (const ep of Object.keys(result.apis.warm)) {
    if (result.apis.warm[ep].p50 > 300) result.ok = false;
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addCookies(
    jar.split("; ").map((pair) => {
      const [name, ...rest] = pair.split("=");
      return { name, value: rest.join("="), url: baseUrl };
    }),
  );
  const page = await context.newPage();

  for (const width of [390, 1440]) {
    result.tabSwitch.warm.push(await tabSwitchMs(page, width));
  }

  await context.clearCookies();
  await context.addCookies(
    jar.split("; ").map((pair) => {
      const [name, ...rest] = pair.split("=");
      return { name, value: rest.join("="), url: baseUrl };
    }),
  );
  const coldPage = await context.newPage();
  await coldPage.goto(`${baseUrl}/api/auth/logout`, { waitUntil: "domcontentloaded" }).catch(() => {});
  await context.addCookies(
    jar.split("; ").map((pair) => {
      const [name, ...rest] = pair.split("=");
      return { name, value: rest.join("="), url: baseUrl };
    }),
  );
  for (const width of [390, 1440]) {
    result.tabSwitch.cold.push(await tabSwitchMs(coldPage, width));
  }

  await browser.close();

  for (const row of [...result.tabSwitch.warm, ...result.tabSwitch.cold]) {
    if (row.max > 1000) result.ok = false;
  }
  if (result.loginMs > 300) result.ok = false;

  writeFileSync(`${outDir}/timings.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
