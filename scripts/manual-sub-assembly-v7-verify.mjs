/**
 * Captures v7 checklist screenshots + bounding boxes for PR #449.
 * Usage: node scripts/manual-sub-assembly-v7-verify.mjs
 */
import { createRequire } from "node:module";
const require = createRequire(
  new URL("../.cursor/skills/verify-oee360/scripts/package.json", import.meta.url),
);
const { chromium } = require("playwright");
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.OEE360_BASE_URL ?? "http://127.0.0.1:3010";
const OUT = process.env.V7_MEDIA_OUT ?? "/cursor/stores/self/media/manual-sub-assembly-refine-v7";
const MACHINE = "/machines/hardware-fixture";

const customer = { email: "customer@spares.local", password: "SparesCustomer1!" };
const staff = { email: "staff@spares.local", password: "SparesStaff1!" };

fs.mkdirSync(OUT, { recursive: true });

const measures = [];

async function box(el) {
  if (!el) return null;
  try {
    return await el.boundingBox({ timeout: 5000 });
  } catch {
    return null;
  }
}

async function login(page, creds) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(creds),
  });
  if (!res.ok) {
    throw new Error(`login failed ${res.status}`);
  }
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const cookies = setCookie.map((row) => {
    const [pair] = row.split(";");
    const [name, ...rest] = pair.split("=");
    return { name, value: rest.join("="), url: BASE };
  });
  if (cookies.length > 0) {
    await page.context().addCookies(cookies);
  }
  await page.goto(`${BASE}/machines`, { waitUntil: "domcontentloaded" });
}

async function expandMotorTree(page) {
  const motor = page.getByRole("button", { name: /Expand \d+ sub-part/i }).first();
  if (await motor.isVisible().catch(() => false)) {
    await motor.click();
  }
}

async function customerFlow(page, width, tag) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`${BASE}${MACHINE}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  const header = page.locator(".spares-header");
  const headerBox = await box(header);
  measures.push({ item: 1, tag, check: "header visible", box: headerBox });

  await page.screenshot({ path: path.join(OUT, `01-header-tray-closed-${tag}.png`) });

  const quoteChip = page.getByRole("button", { name: /Quote/i }).first();
  if (await quoteChip.isVisible().catch(() => false)) {
    await quoteChip.click({ force: true });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, `06-quote-tray-open-${tag}.png`) });
    const close = page.locator(".quote-sheet-close").first();
    if (await close.isVisible().catch(() => false)) {
      await close.click();
      await page.waitForTimeout(600);
    }
  }

  const headerAfter = await box(header);
  const tabbar = page.locator(".spares-tabbar");
  const tabVisible = width >= 1024 ? !(await tabbar.isVisible().catch(() => false)) : true;
  const dock = page.locator(".quote-tray-dock");
  const dockVisible = width >= 1280 ? await dock.count() > 0 : true;
  measures.push({
    item: 1,
    tag,
    check: "after tray close desktop layout",
    headerBottom: headerAfter?.y + headerAfter?.height,
    tabbarHidden: tabVisible,
    hasTrayDock: dockVisible,
  });
  if (width >= 1280) {
    await page.screenshot({ path: path.join(OUT, `07-header-after-tray-close-${tag}.png`) });
  }

  await page.locator("[data-machine-view-tabs] button").filter({ hasText: "List" }).click();
  await page.waitForTimeout(400);
  await expandMotorTree(page);
  await page.screenshot({ path: path.join(OUT, `02-list-tree-expanded-${tag}.png`) });

  const bearing = page.locator("[data-manual-sub-part]").filter({ hasText: /bearing/i }).first();
  if (await bearing.isVisible().catch(() => false)) {
    await bearing.click();
    const rowBox = await box(bearing);
    measures.push({ item: 11, tag, bearingRow: rowBox });
    await page.screenshot({ path: path.join(OUT, `03-bearing-row-selected-${tag}.png`) });
  }

  await page.locator("[data-machine-view-tabs] button").filter({ hasText: "3D" }).click();
  await page.waitForTimeout(1200);
  await page.locator("[data-machine-view-tabs] button").filter({ hasText: "List" }).click();
  await page.waitForTimeout(300);
  await expandMotorTree(page);
  const motorRow = page.locator("li.bom-tree-parent-li").filter({ hasText: /motor/i }).first();
  if (await motorRow.isVisible().catch(() => false)) {
    await motorRow.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, `04-motor-selected-list-${tag}.png`) });
  }

  const sub = page.locator("[data-manual-sub-part]").first();
  if (await sub.isVisible().catch(() => false)) {
    await sub.click();
    await page.waitForTimeout(500);
    const back = page.locator("[data-part-sheet-back-motor]");
    measures.push({
      item: 3,
      tag,
      backVisible: await back.isVisible().catch(() => false),
      backBox: await box(back),
    });
  }

  await page.screenshot({ path: path.join(OUT, `05-3d-part-sheet-peek-${tag}.png`) });

  const sheet = page.locator("[data-part-sheet] .part-sheet-chip");
  const sheetBox = await box(sheet);
  const subRow = page.locator("[data-manual-sub-sheet] [data-manual-sub-part]").first();
  const subRowBox = await box(subRow);
  measures.push({ item: 6, tag, sheetBox, subRowBox, subRowH: subRowBox?.height });
  measures.push({ item: 7, tag, subRowMinH: subRowBox?.height });

  const more = page.getByRole("button", { name: "More" });
  const moreBox = await box(more);
  const sheetClip = sheetBox && moreBox
    ? moreBox.y + moreBox.height <= sheetBox.y + sheetBox.height + 2
    : null;
  measures.push({ item: 8, tag, moreBox, sheetBox, moreNotClipped: sheetClip });

  const serviceTab = page.getByRole("link", { name: "Service" });
  const serviceBox = await box(serviceTab);
  measures.push({ item: 9, tag, serviceBox, viewport: width });

  const listPad = page.locator("[data-parts-bom]");
  const listBox = await box(listPad);
  measures.push({ item: 9, tag, listMargins: listBox });

  const qtyCol = page.locator(".bom-qty-col").first();
  measures.push({ item: 5, tag, qtyCol: await box(qtyCol) });

  const title = page.locator("[data-part-sheet-title]");
  const idLine = page.locator(".part-sheet-qty-inline");
  measures.push({
    item: 10,
    tag,
    qtyInline: await idLine.isVisible().catch(() => false),
    titleBox: await box(title),
  });
}

async function staffFlow(page, width, tag) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`${BASE}${MACHINE}`, { waitUntil: "networkidle" });
  await expandMotorTree(page);
  const motorLi = page.locator("li.bom-tree-parent-li").filter({ hasText: /motor/i }).first();
  await motorLi.click();
  await page.waitForTimeout(400);
  const editSub = page.getByRole("button", { name: "Edit sub-parts" });
  if (await editSub.isVisible().catch(() => false)) {
    await editSub.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, `10-staff-editor-open-${tag}.png`) });
    const cancel = page.locator("[data-staff-manual-sub-cancel]");
    const cancelBox = await box(cancel);
    measures.push({ item: 2, tag, cancelBox });
    await cancel.focus();
    measures.push({ item: 2, tag, cancelFocused: await cancel.evaluate((el) => el === document.activeElement) });
    await cancel.click();
    await page.waitForTimeout(400);
    const motorStill = await motorLi.evaluate((el) => el.classList.contains("row-on-ink"));
    const sheetOpen = await page.locator("[data-part-sheet]").count();
    measures.push({ item: 2, tag, motorStillSelected: motorStill, partSheetCount: sheetOpen });
    await page.screenshot({ path: path.join(OUT, `11-staff-cancel-keeps-motor-${tag}.png`) });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await login(page, customer);
  await customerFlow(page, 1440, "1440");
  await customerFlow(page, 390, "390");

  await context.clearCookies();
  await login(page, staff);
  await staffFlow(page, 390, "390");
  await staffFlow(page, 1440, "1440");

  fs.writeFileSync(path.join(OUT, "measures.json"), JSON.stringify(measures, null, 2));
  await browser.close();
  console.log(JSON.stringify({ out: OUT, measures }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
