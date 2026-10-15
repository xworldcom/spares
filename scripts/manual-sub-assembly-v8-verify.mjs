/**
 * v8 checklist: rects + screenshots for PR #449.
 * Usage: OEE360_BASE_URL=http://127.0.0.1:3010 node scripts/manual-sub-assembly-v8-verify.mjs
 */
import { createRequire } from "node:module";
const require = createRequire(
  new URL("../.cursor/skills/verify-oee360/scripts/package.json", import.meta.url),
);
const { chromium } = require("playwright");
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.OEE360_BASE_URL ?? "http://127.0.0.1:3010";
const OUT =
  process.env.V8_MEDIA_OUT ??
  "/cursor/stores/bc-7479d24f-d92e-51f0-ab53-0ec629d66015/media/manual-sub-assembly-refine-v8";
const MACHINE = "/machines/hardware-fixture";

const customer = { email: "customer@spares.local", password: "SparesCustomer1!" };

fs.mkdirSync(OUT, { recursive: true });

const measures = [];

async function box(locator) {
  try {
    const el = typeof locator === "object" && locator?.first ? locator.first() : locator;
    if (await el.isVisible().catch(() => false)) {
      return await el.boundingBox({ timeout: 8000 });
    }
  } catch {
    /* ignore */
  }
  return null;
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
}

async function expandMotorTree(page) {
  const motor = page.getByRole("button", { name: /Expand \d+ sub-part/i }).first();
  if (await motor.isVisible().catch(() => false)) {
    await motor.click();
  }
}

async function drawerCycle(page, tag, n) {
  await page.locator("[data-machine-view-tabs] button").filter({ hasText: "List" }).click();
  await page.waitForTimeout(400);
  const quoteChip = page.getByRole("button", { name: /Quote/i }).first();
  const dock = page.locator(".quote-tray-dock");
  const grid = page.locator(".machine-stage-grid");
  const headerName = page.locator(".machine-context-name");
  const close = page.locator(".quote-sheet-close").first();

  for (let i = 1; i <= n; i += 1) {
    await quoteChip.click({ force: true });
    await page.waitForTimeout(450);
    const dockBox = await box(dock);
    const gridTray = await grid.getAttribute("data-tray");
    measures.push({
      item: 1,
      tag,
      phase: `open-${i}`,
      dockBox,
      dataTray: gridTray,
      headerName: await box(headerName),
    });
    if (await close.isVisible().catch(() => false)) {
      await close.click({ force: true });
      await page.waitForTimeout(500);
    }
    const afterClose = {
      dockBox: await box(dock),
      dataTray: await grid.getAttribute("data-tray"),
      headerName: await box(headerName),
      quoteChip: await box(quoteChip),
    };
    measures.push({ item: 1, tag, phase: `close-${i}`, ...afterClose });
    await page.screenshot({
      path: path.join(OUT, `01-drawer-cycle-${tag}-${i}.png`),
    });
  }
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(900);
  const afterReload = {
    headerName: await box(headerName),
    header: await box(page.locator(".spares-header")),
    dataTray: await grid.getAttribute("data-tray"),
  };
  measures.push({ item: 1, tag, phase: "after-reload", ...afterReload });
  await page.screenshot({ path: path.join(OUT, `01-after-reload-${tag}.png`) });
}

async function customer1440(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}${MACHINE}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);

  await drawerCycle(page, "1440", 3);

  await page.locator("[data-machine-view-tabs] button").filter({ hasText: "List" }).click();
  await page.waitForTimeout(500);
  await expandMotorTree(page);
  const motorRow = page.locator("li.bom-tree-parent-li").filter({ hasText: /motor/i }).first();
  await motorRow.waitFor({ state: "visible", timeout: 20_000 });
  await motorRow.click();
  await page.locator("[data-machine-view-tabs] button").filter({ hasText: "3D" }).click();
  await page.waitForTimeout(800);
  await page.waitForTimeout(400);

  const sheet = page.locator("[data-part-sheet] .part-sheet-chip");
  const more = page.getByRole("button", { name: "More" });
  const add = page.getByRole("button", { name: "Add" }).first();
  const sheetBox = await box(sheet);
  const moreBox = await box(more);
  const addBox = await box(add);
  measures.push({
    item: 2,
    tag: "1440",
    before: "v7 inner-scroll",
    sheetBox,
    moreBox,
    addBox,
    moreInsideSheet:
      sheetBox && moreBox
        ? moreBox.y + moreBox.height <= sheetBox.y + sheetBox.height + 2
        : null,
  });
  await page.screenshot({ path: path.join(OUT, "02-3d-card-actions-1440.png") });
}

async function customer390(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}${MACHINE}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);

  await expandMotorTree(page);
  const harness = page.locator("[data-manual-sub-part]").filter({ hasText: /harness/i }).first();
  if (await harness.isVisible().catch(() => false)) {
    await harness.click();
    await page.waitForTimeout(400);
  }

  await page.locator("[data-machine-view-tabs] button").filter({ hasText: "3D" }).click();
  await page.waitForTimeout(1200);

  const layout = page.locator("[data-machine-viewer-layout]");
  const canvas = page.locator("canvas").first();
  const layoutBox = await box(layout);
  const canvasBox = await box(canvas);
  measures.push({
    item: 4,
    tag: "390",
    layoutBox,
    canvasBox,
    canvasWidthOk: canvasBox ? Math.abs(canvasBox.width - 390) < 8 : false,
  });

  const sheetBefore = await box(page.locator("[data-part-sheet] .part-sheet-chip"));
  const resetBtn = page.getByRole("button", { name: /Reset view/i });
  const resetBefore = await box(resetBtn);
  measures.push({
    item: 4,
    tag: "390",
    sheetCoversReset:
      sheetBefore && resetBefore
        ? sheetBefore.y < resetBefore.y + resetBefore.height &&
          sheetBefore.y + sheetBefore.height > resetBefore.y
        : null,
    sheetBefore,
    resetBefore,
  });

  const canvasBoxBefore = await box(canvas);
  const boxBeforePick = canvasBoxBefore;
  if (canvasBoxBefore) {
    await page.mouse.click(
      canvasBoxBefore.x + canvasBoxBefore.width * 0.5,
      canvasBoxBefore.y + canvasBoxBefore.height * 0.42,
    );
    await page.waitForTimeout(500);
  }
  const title = await page.locator("[data-part-sheet-title]").textContent().catch(() => "");
  measures.push({
    item: 3,
    tag: "390",
    titleAfterMotorTap: title?.trim(),
    motorNotHarness: !/harness/i.test(title ?? ""),
    canvasBoxBefore: boxBeforePick,
  });
  await page.screenshot({ path: path.join(OUT, "03-390-motor-pick-3d.png") });

  const sheetBox = await box(page.locator("[data-part-sheet] .part-sheet-chip"));
  measures.push({ item: 6, tag: "390", sheetBox });
  await page.screenshot({ path: path.join(OUT, "04-390-3d-card-peek.png") });

  await page.locator("[data-machine-view-tabs] button").filter({ hasText: "List" }).click();
  await page.waitForTimeout(400);
  await expandMotorTree(page);
  const row = page.locator("[data-manual-sub-part]").first();
  measures.push({ item: 5, tag: "390", rowH: (await box(row))?.height });
  await page.screenshot({ path: path.join(OUT, "05-390-list-rows.png") });

  const serviceTab = page.getByRole("link", { name: "Service" });
  const serviceBox = await box(serviceTab);
  measures.push({
    item: 7,
    tag: "390",
    serviceBox,
    serviceInView: serviceBox ? serviceBox.x + serviceBox.width <= 390 : null,
  });
  await page.screenshot({ path: path.join(OUT, "06-390-service-tab.png") });

  const qtyInline = page.locator(".part-sheet-qty-inline");
  measures.push({
    item: 8,
    tag: "390",
    qtyInline: await qtyInline.isVisible().catch(() => false),
  });

  const nameCell = page.locator(".bom-tree-name .bom-row-text").first();
  measures.push({ item: 9, tag: "390", nameCell: await box(nameCell) });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await login(page, customer);
    await customer1440(page);
    await customer390(page);
  } finally {
    fs.writeFileSync(path.join(OUT, "measures.json"), JSON.stringify(measures, null, 2));
    await browser.close();
  }
  console.log(JSON.stringify({ out: OUT, measures }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
