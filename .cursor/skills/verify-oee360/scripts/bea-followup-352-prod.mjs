#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.OEE360_BASE_URL || "https://oee360.com";
const outDir = resolve(
  process.env.OEE360_EVIDENCE_DIR ||
    "/cursor/stores/self/media/staff-app/bea-followup-352-prod",
);
mkdirSync(outDir, { recursive: true });

const proof = { baseUrl, checks: [], ok: true };
const browser = await chromium.launch({ headless: true });

// Login card @1440 (signed out)
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector(".login-page-card", { timeout: 30000 });
  const card = await page.locator(".login-page-card").boundingBox();
  const main = await page.locator("main").boundingBox();
  const centered =
    card && main
      ? Math.abs(card.x + card.width / 2 - (main.x + main.width / 2)) < 80
      : false;
  await page.screenshot({ path: join(outDir, "login-1440-card.png") });
  proof.checks.push({ id: "login-1440-card", centered, card, pass: centered });
  if (!centered) proof.ok = false;
  await page.close();
}

const context = await browser.newContext();
const login = await context.request.post(`${baseUrl}/api/auth/login`, {
  data: { email: "user@demo.com", password: "demo123456" },
});
if (!login.ok()) {
  proof.ok = false;
  proof.checks.push({ id: "login-api", pass: false });
} else {
  const page = await context.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${baseUrl}/quotes`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.locator("a.care-row, a[href*='/quotes/']").first().click();
  await page.waitForURL("**/quotes/**", { timeout: 60000 });
  await page.waitForSelector(".quote-progress-track", { timeout: 60000 });
  const firstLabel = page.locator(".quote-progress-step").first().locator(".quote-progress-label-full");
  const box = await firstLabel.boundingBox();
  const track = await page.locator(".quote-progress-track").boundingBox();
  const clipLeft = box && track ? box.x < track.x + 2 : true;
  await page.screenshot({ path: join(outDir, "quote-stepper-390.png") });
  proof.checks.push({
    id: "stepper-requested-390",
    pass: !clipLeft,
    labelX: box?.x,
    trackX: track?.x,
  });
  if (clipLeft) proof.ok = false;

  await page.goto(`${baseUrl}/machines/hardware-fixture`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await page.getByRole("button", { name: "List" }).click();
  await page.waitForTimeout(500);
  await page.locator("ul[data-parts-bom] button").first().click({ timeout: 30000 });
  await page.waitForSelector("[data-part-sheet]", { timeout: 15000 });
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("button", { name: "Only this" }).click();
  await page.getByRole("button", { name: "3D" }).click();
  await page.waitForTimeout(500);
  await page.waitForTimeout(500);
  const showAll = page.locator("[data-show-all]");
  const visible = await showAll.isVisible();
  const showBox = visible ? await showAll.boundingBox() : null;
  await page.screenshot({ path: join(outDir, "phone-3d-show-all-390.png") });
  proof.checks.push({
    id: "phone-3d-show-all",
    pass: visible && showBox && showBox.width > 40,
    visible,
    showBox,
  });
  if (!visible) proof.ok = false;
}

await browser.close();
writeFileSync(join(outDir, "proof.json"), JSON.stringify(proof, null, 2));
console.log(JSON.stringify(proof, null, 2));
process.exit(proof.ok ? 0 : 1);
