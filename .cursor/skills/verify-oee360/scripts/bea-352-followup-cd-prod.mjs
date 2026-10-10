#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.OEE360_BASE_URL || "https://oee360.com";
const outDir = resolve(
  process.env.OEE360_EVIDENCE_DIR ||
    "/cursor/stores/self/media/staff-app/bea-352-followup-cd",
);
mkdirSync(outDir, { recursive: true });

const proof = { baseUrl, checks: [], ok: true };
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
await ctx.request.post(`${baseUrl}/api/auth/login`, {
  data: { email: "user@demo.com", password: "demo123456" },
});

async function stepper390(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/quotes/27`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector(".quote-progress-track", { timeout: 60000 });
  await page.waitForTimeout(600);
  const scrollLeft = await page.locator(".quote-progress-track").evaluate((el) => el.scrollLeft);
  const firstLabel = await page
    .locator(".quote-progress-step")
    .first()
    .locator(".quote-progress-label-full")
    .innerText();
  const box = await page
    .locator(".quote-progress-step")
    .first()
    .locator(".quote-progress-label-full")
    .boundingBox();
  const track = await page.locator(".quote-progress-track").boundingBox();
  const clip = box && track ? box.x < track.x - 1 : true;
  await page.screenshot({ path: join(outDir, "quote-27-stepper-390.png") });
  const pass = scrollLeft <= 1 && firstLabel.includes("Requested") && !clip;
  return { scrollLeft, firstLabel, clip, pass };
}

async function viewerChrome(page, w, h, name) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(`${baseUrl}/machines/hardware-fixture`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await page.getByRole("button", { name: "3D" }).click();
  await page.waitForTimeout(500);
  const showAll = await page.locator("[data-show-all]").isVisible();
  const fit = await page.locator("[data-fit-view]").isVisible();
  const reset = await page.locator("[data-reset-view]").isVisible();
  const fs = await page.getByRole("button", { name: /full screen/i }).isVisible();
  await page.screenshot({ path: join(outDir, `viewer-chrome-${name}.png`) });
  const pass = showAll && fit && reset && fs;
  return { showAll, fit, reset, fs, pass };
}

const page = await ctx.newPage();
proof.checks.push({ id: "stepper-390", ...(await stepper390(page)) });
if (!proof.checks.at(-1).pass) proof.ok = false;

for (const [w, h, name] of [
  [390, 844, "390"],
  [1280, 800, "1280"],
  [1440, 900, "1440"],
  [1920, 1080, "1920"],
]) {
  const r = await viewerChrome(page, w, h, name);
  proof.checks.push({ id: `viewer-${name}`, ...r });
  if (!r.pass) proof.ok = false;
}

await browser.close();
writeFileSync(join(outDir, "proof.json"), JSON.stringify(proof, null, 2));
console.log(JSON.stringify(proof, null, 2));
process.exit(proof.ok ? 0 : 1);
