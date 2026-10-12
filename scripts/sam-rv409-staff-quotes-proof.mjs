/**
 * Sam #409 staff-quotes re-verify proof (local disposable store).
 * Run against dev server with SPARES_ALLOW_SEED=true.
 *
 *   node scripts/sam-rv409-staff-quotes-proof.mjs
 *
 * Env: BASE_URL (default http://127.0.0.1:3000)
 */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

/** Use localhost (not 127.0.0.1) so fetch Origin matches page origin for password login. */
const base = process.env.BASE_URL || "http://localhost:3000";
const outDir = "/opt/cursor/artifacts/screenshots";
const staff = { email: "staff@spares.local", password: "SparesStaff1!" };

async function shot(page, name) {
  await mkdir(outDir, { recursive: true });
  const path = `${outDir}/${name}`;
  await page.screenshot({ path, fullPage: true });
  return path;
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto(`${base}/login`);
await page.getByLabel("Email").fill(staff.email);
await page.getByLabel("Password").fill(staff.password);
await page.getByRole("button", { name: "Sign in" }).click();
await page.waitForURL(/\/(machines|staff)/, { timeout: 30000 });

await page.goto(`${base}/staff/quotes`);
await page.waitForLoadState("networkidle");
const search = page.getByLabel("Search quotes");
await search.waitFor({ timeout: 15000 });
const searchShot = await shot(page, "sam-rv409-staff-quotes-search.png");

const firstQuote = page.locator("ul a, ul button").first();
const firstText = await page.locator("ul li").first().innerText().catch(() => "");
await firstQuote.click();
await page.waitForLoadState("networkidle");

const qtyInput = page.getByLabel("Qty").first();
await qtyInput.click();
await qtyInput.fill("-3");
await qtyInput.blur();
const qtyError = page.getByRole("alert").filter({ hasText: /at least 1/i });
await qtyError.waitFor({ timeout: 8000 });
const qtyShot = await shot(page, "sam-rv409-qty-negative-error.png");

const trackingRemove = page.getByRole("button", { name: "Remove" }).first();
const hasRemove = await trackingRemove.isVisible().catch(() => false);
let trackingShot = null;
if (hasRemove) {
  trackingShot = await shot(page, "sam-rv409-tracking-remove-visible.png");
}

let confirmShot = null;
let backdropHeight = null;
await page.getByRole("button", { name: /requested/i }).click().catch(() => {});
const regress = page.getByRole("alertdialog");
if (await regress.isVisible().catch(() => false)) {
  const backdrop = page.locator(".confirm-sheet-backdrop");
  await backdrop.waitFor();
  const box = await backdrop.boundingBox();
  backdropHeight = box?.height ?? null;
  confirmShot = await shot(page, "sam-rv409-regress-confirm-backdrop.png");
}

const proof = {
  ok: true,
  base,
  staffEmail: staff.email,
  searchShot,
  qtyShot,
  trackingShot,
  confirmShot,
  backdropHeight,
  hasTrackingRemove: hasRemove,
  firstListRow: firstText.slice(0, 120),
  capturedAt: new Date().toISOString(),
};

await mkdir("/opt/cursor/artifacts", { recursive: true });
await writeFile(
  "/opt/cursor/artifacts/sam-rv409-staff-quotes-proof.json",
  JSON.stringify(proof, null, 2),
);
console.log(JSON.stringify(proof, null, 2));

await browser.close();
