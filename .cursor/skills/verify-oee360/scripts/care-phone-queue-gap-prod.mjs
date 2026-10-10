#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, devices } from "playwright";

const baseUrl = process.env.OEE360_BASE_URL || "https://oee360.com";
const outDir = resolve(
  process.env.OEE360_EVIDENCE_DIR ||
    "/cursor/stores/self/media/staff-app/care-phone-queue-gap",
);
mkdirSync(outDir, { recursive: true });

const accounts = [
  { key: "user", email: "user@demo.com", password: "demo123456" },
  { key: "staff", email: "staff@demo.com", password: "demo123456" },
];

const routes = [
  { key: "care-hub", path: "/care/tickets" },
  { key: "machine-care", path: "/machines/hardware-fixture/care/tickets" },
];

const desktops = [
  ["1280", 1280, 800],
  ["1440", 1440, 900],
  ["1920", 1920, 1080],
];

async function measureGap(page) {
  const search = await page.locator("#care-tickets-search").boundingBox();
  const chips = await page.locator(".tickets-workspace-filter-row").boundingBox();
  if (!search || !chips) {
    return { gap: null, reason: "missing elements" };
  }
  const catalogSearch = await page.locator(".tickets-workspace-filters .catalog-search").boundingBox();
  const gap = chips.y - (search.y + search.height);
  const catalogExtra =
    catalogSearch ? catalogSearch.height - search.height : null;
  return { gap, catalogExtra, search, chips, catalogSearch };
}

const browser = await chromium.launch({ headless: true });
const proof = { baseUrl, measures: [], ok: true };

for (const account of accounts) {
  const context = await browser.newContext();
  const login = await context.request.post(`${baseUrl}/api/auth/login`, {
    data: { email: account.email, password: account.password },
  });
  if (!login.ok()) {
    proof.ok = false;
    proof.measures.push({ account: account.key, error: `login ${login.status()}` });
    await context.close();
    continue;
  }
  const page = await context.newPage();

  for (const route of routes) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${baseUrl}${route.path}`, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await page.waitForSelector("#care-tickets-search", { timeout: 120000 });
    await page.waitForTimeout(800);
    const m = await measureGap(page);
    const shot = `${account.key}-${route.key}-390.png`;
    await page.screenshot({ path: join(outDir, shot), fullPage: true });
    const pass = m.gap !== null && m.gap < 24;
    if (!pass) proof.ok = false;
    proof.measures.push({
      account: account.key,
      route: route.key,
      viewport: "390x844",
      ...m,
      pass,
      shot,
    });
  }

  for (const [label, w, h] of desktops) {
    await page.setViewportSize({ width: w, height: h });
    for (const route of routes) {
      await page.goto(`${baseUrl}${route.path}`, {
        waitUntil: "domcontentloaded",
        timeout: 120000,
      });
      await page.waitForSelector("#care-tickets-search", { timeout: 120000 });
      await page.waitForTimeout(500);
      const m = await measureGap(page);
      const shot = `${account.key}-${route.key}-${label}.png`;
      await page.screenshot({ path: join(outDir, shot), fullPage: false });
      const pass = m.gap !== null && m.gap < 16;
      if (!pass) proof.ok = false;
      proof.measures.push({
        account: account.key,
        route: route.key,
        viewport: `${w}x${h}`,
        ...m,
        pass,
        shot,
      });
    }
  }

  await context.close();
}

// WebKit (Safari-like) @390 for user
const webkit = devices["iPhone 13"];
const wctx = await browser.newContext({ ...webkit });
const wlogin = await wctx.request.post(`${baseUrl}/api/auth/login`, {
  data: { email: "user@demo.com", password: "demo123456" },
});
if (wlogin.ok()) {
  const wpage = await wctx.newPage();
  await wpage.goto(`${baseUrl}/care/tickets`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await wpage.waitForSelector("#care-tickets-search", { timeout: 120000 });
  await wpage.waitForTimeout(800);
  const m = await measureGap(wpage);
  await wpage.screenshot({
    path: join(outDir, "user-care-hub-390-webkit.png"),
    fullPage: true,
  });
  const pass = m.gap !== null && m.gap < 24;
  if (!pass) proof.ok = false;
  proof.measures.push({
    account: "user",
    route: "care-hub",
    viewport: "390-webkit",
    ...m,
    pass,
    shot: "user-care-hub-390-webkit.png",
  });
}
await wctx.close();

await browser.close();
writeFileSync(join(outDir, "proof.json"), JSON.stringify(proof, null, 2));
console.log(JSON.stringify(proof, null, 2));
process.exit(proof.ok ? 0 : 1);
