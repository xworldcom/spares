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

async function probeApis(jar, mode) {
  const endpoints = {};
  for (const ep of ["/api/machines", "/api/quotes", "/api/tickets"]) {
    const coldHeaders = { cookie: jar, "cache-control": "no-cache" };
    const tCold = performance.now();
    const coldRes = await fetch(`${baseUrl}${ep}`, { headers: coldHeaders });
    const coldBody = await coldRes.arrayBuffer();
    const coldMs = Math.round(performance.now() - tCold);
    const etag = coldRes.headers.get("etag");

    const warm200 = [];
    for (let i = 0; i < 4; i++) {
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
        warm304.push({
          ms: Math.round(performance.now() - t0),
          status: res.status,
        });
      }
    }

    endpoints[ep] = {
      cold: {
        ms: coldMs,
        status: coldRes.status,
        bytes: coldBody.byteLength,
        etag,
      },
      warm200: { p50: p50(warm200), samples: warm200 },
      warm304: {
        p50: p50(warm304.map((s) => s.ms)),
        samples: warm304,
      },
    };
  }
  return endpoints;
}

function navLocators(page, width) {
  const mobile = width < 1024;
  if (mobile) {
    return {
      quotes: page.locator('nav[aria-label="Primary"] a[href="/staff/quotes"]'),
      care: page.locator('nav[aria-label="Primary"] a[href="/care"]'),
      machines: page.locator('nav[aria-label="Primary"] button:has-text("Machines")'),
    };
  }
  return {
    quotes: page.locator('nav[aria-label="Main"] a[href="/staff/quotes"]'),
    care: page.locator('nav[aria-label="Main"] a[href="/care"]'),
    machines: page.locator('header a[href="/machines"]').first(),
  };
}

async function tabSwitchMs(page, width) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`${baseUrl}/machines`, { waitUntil: "networkidle" });
  const nav = navLocators(page, width);

  const measureHop = async (locator) => {
    const t0 = performance.now();
    await locator.click({ timeout: 20_000 });
    await page.waitForLoadState("domcontentloaded");
    await page.waitForSelector("main", { timeout: 15_000 });
    return Math.round(performance.now() - t0);
  };

  const toQuotes = await measureHop(nav.quotes);
  const toCare = await measureHop(nav.care);
  const toMachines = await measureHop(nav.machines);
  return { width, toQuotes, toCare, toMachines, max: Math.max(toQuotes, toCare, toMachines) };
}

async function main() {
  const result = {
    baseUrl,
    at: new Date().toISOString(),
    loginMs: null,
    apis: null,
    tabSwitch: { warm: [], cold: [] },
    ok: true,
  };

  const { loginMs, jar } = await loginJar();
  result.loginMs = loginMs;

  result.apis = await probeApis(jar, "probe");

  for (const ep of Object.keys(result.apis)) {
    const row = result.apis[ep];
    if (row.warm200.p50 > 300) result.ok = false;
    if (row.warm304.p50 > 300) result.ok = false;
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

  for (const width of [390, 1440]) {
    const coldContext = await browser.newContext();
    await coldContext.addCookies(
      jar.split("; ").map((pair) => {
        const [name, ...rest] = pair.split("=");
        return { name, value: rest.join("="), url: baseUrl };
      }),
    );
    const coldPage = await coldContext.newPage();
    result.tabSwitch.cold.push(await tabSwitchMs(coldPage, width));
    await coldContext.close();
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
