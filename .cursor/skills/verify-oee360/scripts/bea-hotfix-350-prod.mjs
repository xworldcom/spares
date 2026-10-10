#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.OEE360_BASE_URL || "https://oee360.com";
const outDir = resolve(
  process.env.OEE360_EVIDENCE_DIR ||
    "/cursor/stores/self/media/staff-app/bea-hotfix-350-prod-verify",
);
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const res = await context.request.post(`${baseUrl}/api/auth/login`, {
  data: { email: "staff@demo.com", password: "demo123456" },
});
if (!res.ok()) throw new Error(`login ${res.status()}`);

const page = await context.newPage();

for (const [name, w, h] of [
  ["1280", 1280, 900],
  ["390", 390, 844],
]) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(outDir, `login-${name}.png`), fullPage: false });
}

await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${baseUrl}/machines/palletizer`, {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await page.getByRole("button", { name: "List" }).click();
await page.locator("#parts-bom-search").fill("gear");
await page.waitForTimeout(500);
const row = page.locator("[data-parts-bom] .row-on-ink").first();
if (await row.count()) {
  const color = await row.locator('[role="status"]').evaluate((el) =>
    getComputedStyle(el).color,
  );
  await page.screenshot({ path: join(outDir, "390-gearmotor-selected.png") });
  console.log(JSON.stringify({ selectedLifecycleColor: color }));
}

const tray = page.locator("[data-quote-tray]");
if (await tray.count()) {
  const handle = page.locator(".quote-sheet-handle");
  const box = await handle.boundingBox();
  if (box) {
    const startY = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width / 2, startY);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, startY - 120, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    const dragVar = await tray.evaluate((el) => el.style.getPropertyValue("--drag"));
    await page.screenshot({ path: join(outDir, "390-tray-after-drag.png") });
    console.log(JSON.stringify({ trayDragPx: dragVar }));
  }
}

await browser.close();
console.log(JSON.stringify({ ok: true, outDir }, null, 2));
