#!/usr/bin/env node
/**
 * Prod spot: staff quote composer + customer 3D isolate/show-all @390.
 */
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const baseUrl = process.env.OEE360_BASE_URL || "https://oee360.com";
const email = process.env.STAFF_EMAIL || "staff@demo.com";
const password = process.env.STAFF_PASSWORD || "demo123456";
const outDir = resolve(
  process.env.OEE360_EVIDENCE_DIR ||
    "/cursor/stores/self/media/staff-app/sam-low-batch-prod-verify",
);

mkdirSync(outDir, { recursive: true });

function cookiesFromJar(jarPath, host) {
  try {
    const text = readFileSync(jarPath, "utf8");
    const cookies = [];
    for (const line of text.split("\n")) {
      if (!line || line.startsWith("#")) continue;
      const parts = line.split("\t");
      if (parts.length < 7) continue;
      const [, , path, , , name, value] = parts;
      cookies.push({ name, value, domain: host, path });
    }
    return cookies;
  } catch {
    return null;
  }
}

const host = new URL(baseUrl).hostname.replace(/^www\./, "");
const jar = join(__dirname, "../.run-state/cookies.txt");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const res = await context.request.post(`${baseUrl}/api/auth/login`, {
  data: { email, password },
});
if (!res.ok()) {
  const jarCookies = cookiesFromJar(jar, host);
  if (jarCookies?.length) {
    await context.addCookies(jarCookies);
  } else {
    throw new Error(`login failed ${res.status()}`);
  }
}
const page = await context.newPage();

const desktops = [
  { name: "1280", width: 1280, height: 900 },
  { name: "1440", width: 1440, height: 900 },
  { name: "1920", width: 1920, height: 1080 },
];

for (const vp of desktops) {
  await page.setViewportSize({ width: vp.width, height: vp.height });
  await page.goto(`${baseUrl}/staff/quotes/26`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.screenshot({
    path: join(outDir, `${vp.name}-quote-26.png`),
    fullPage: false,
  });
}

await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${baseUrl}/staff/quotes/26`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: join(outDir, "390-quote-26.png"), fullPage: true });

// Customer 3D isolate / show all @390
await page.goto(`${baseUrl}/machines/palletizer`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.locator("canvas").first().waitFor({ state: "visible", timeout: 60000 });
const listBtn = page.getByRole("button", { name: "List" });
if (await listBtn.isVisible()) {
  await listBtn.click();
}
const firstRow = page.locator("[data-parts-bom] li button").first();
if (await firstRow.count()) {
  await firstRow.click();
  const only = page.getByRole("button", { name: /Only this/i });
  if (await only.count()) {
    await only.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(outDir, "390-3d-isolated.png") });
    const showAll = page.getByRole("button", { name: /Show all/i }).first();
    if (await showAll.isVisible()) {
      await showAll.click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: join(outDir, "390-3d-show-all.png") });
    }
  }
}

await browser.close();
console.log(JSON.stringify({ ok: true, outDir }, null, 2));
