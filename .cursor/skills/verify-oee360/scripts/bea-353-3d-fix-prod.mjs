#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.OEE360_BASE_URL || "https://oee360.com";
const outDir = resolve(
  process.env.OEE360_EVIDENCE_DIR ||
    "/cursor/stores/self/media/staff-app/bea-353-3d-fix",
);
mkdirSync(outDir, { recursive: true });

const proof = { baseUrl, checks: [], ok: true };
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
await ctx.request.post(`${baseUrl}/api/auth/login`, {
  data: { email: "user@demo.com", password: "demo123456" },
});
const page = await ctx.newPage();

for (const [w, h, name] of [
  [1280, 800, "1280"],
  [1440, 900, "1440"],
  [1920, 1080, "1920"],
]) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(`${baseUrl}/machines/hardware-fixture`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await page.getByRole("button", { name: "3D" }).click();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "Enter full screen" }).click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(outDir, `fs-${name}-during.png`) });
  await page.getByRole("button", { name: "Exit full screen" }).click();
  await page.waitForTimeout(1500);
  const canvas = page.locator("canvas").first();
  const box = await canvas.boundingBox();
  const fsActive = await page.evaluate(() => Boolean(document.fullscreenElement));
  await page.screenshot({
    path: join(outDir, `after-exit-${name}.png`),
    fullPage: false,
  });
  const pass = !fsActive && box && box.width > 100 && box.height > 100;
  proof.checks.push({ id: `after-exit-${name}`, fsActive, canvas: box, pass });
  if (!pass) proof.ok = false;
}

await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${baseUrl}/machines/hardware-fixture`, { timeout: 120000 });
await page.getByRole("button", { name: "3D" }).click();
await page.getByRole("button", { name: "Enter full screen" }).click();
await page.waitForTimeout(500);
const fsBefore = await page.evaluate(() => Boolean(document.fullscreenElement));
await page.locator("canvas").first().dispatchEvent("wheel", { deltaY: 120 });
await page.waitForTimeout(300);
const fsAfterWheel = await page.evaluate(() => Boolean(document.fullscreenElement));
proof.checks.push({
  id: "wheel-390-fs",
  pass: fsBefore && fsAfterWheel,
  fsBefore,
  fsAfterWheel,
});
if (!proof.checks.at(-1).pass) proof.ok = false;

await browser.close();
writeFileSync(join(outDir, "proof.json"), JSON.stringify(proof, null, 2));
console.log(JSON.stringify(proof, null, 2));
process.exit(proof.ok ? 0 : 1);
