/**
 * v10 checklist: rects + screenshots for PR #449.
 * Usage: OEE360_BASE_URL=http://127.0.0.1:3010 node scripts/manual-sub-assembly-v10-verify.mjs
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
  process.env.V10_MEDIA_OUT ??
  "/cursor/stores/self/media/manual-sub-assembly-refine-v10";
const MACHINE = "/machines/hardware-fixture";

const customer = { email: "customer@spares.local", password: "SparesCustomer1!" };
const staff = { email: "staff@spares.local", password: "SparesStaff1!" };

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
    measures.push({
      item: "keep-v8-1",
      tag,
      phase: `open-${i}`,
      dockBox: await box(dock),
      dataTray: await grid.getAttribute("data-tray"),
      headerName: await box(headerName),
    });
    if (await close.isVisible().catch(() => false)) {
      await close.click({ force: true });
      await page.waitForTimeout(500);
    }
    measures.push({
      item: "keep-v8-1",
      tag,
      phase: `close-${i}`,
      dockBox: await box(dock),
      dataTray: await grid.getAttribute("data-tray"),
      headerName: await box(headerName),
    });
    await page.screenshot({
      path: path.join(OUT, `keep-01-drawer-cycle-${tag}-${i}.png`),
    });
  }
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(900);
  measures.push({
    item: "keep-v8-1",
    tag,
    phase: "after-reload",
    header: await box(page.locator(".spares-header")),
    headerName: await box(headerName),
  });
  await page.screenshot({ path: path.join(OUT, `keep-01-after-reload-${tag}.png`) });
}

async function customer1440(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}${MACHINE}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);

  await drawerCycle(page, "1440", 3);

  await page.locator("[data-machine-view-tabs] button").filter({ hasText: "List" }).click();
  await page.waitForTimeout(500);
  await expandMotorTree(page);
  await page.locator("li.bom-tree-parent-li").filter({ hasText: /motor/i }).first().click();
  await page.locator("[data-machine-view-tabs] button").filter({ hasText: "3D" }).click();
  await page.waitForTimeout(800);

  const sheet = page.locator("[data-part-sheet] .part-sheet-chip");
  const more = page.getByRole("button", { name: "More" });
  const sheetBox = await box(sheet);
  const moreBox = await box(more);
  measures.push({
    item: "keep-v8-2",
    tag: "1440",
    sheetBox,
    moreBox,
    moreInsideSheet:
      sheetBox && moreBox
        ? moreBox.y + moreBox.height <= sheetBox.y + sheetBox.height + 2
        : null,
  });
  await page.screenshot({ path: path.join(OUT, "keep-02-3d-card-actions-1440.png") });

  await page.locator("[data-machine-view-tabs] button").filter({ hasText: "List" }).click();
  await page.waitForTimeout(500);
  await expandMotorTree(page);
  const pinion = page.locator("[data-manual-sub-part]").filter({ hasText: /pinion/i }).first();
  if (await pinion.isVisible().catch(() => false)) {
    await pinion.click();
    await page.waitForTimeout(400);
  }
  const headerAdds = page.locator(".part-sheet-header").getByRole("button", { name: "Add" });
  const footerAdds = page
    .locator("[data-part-sheet] .part-sheet-chip")
    .getByRole("button", { name: "Add" });
  measures.push({
    item: 3,
    tag: "1440",
    addCount: await footerAdds.count(),
    headerAddVisible: await headerAdds.isVisible().catch(() => false),
    backBox: await box(page.locator("[data-part-sheet-back-motor]")),
    backText: await page.locator("[data-part-sheet-back-motor]").textContent(),
  });
  await page.screenshot({ path: path.join(OUT, "03-1440-one-add-back-1440.png") });

  await page.locator("[data-machine-view-tabs] button").filter({ hasText: "3D" }).click();
  await page.waitForTimeout(500);
  const closeBtn = page.locator("[data-part-sheet-close]");
  await closeBtn.click({ force: true });
  await page.waitForTimeout(400);
  const sheetGone = !(await page.locator("[data-part-sheet]").isVisible().catch(() => false));
  measures.push({ item: 7, tag: "1440", desktopCloseDismisses: sheetGone });
  await page.screenshot({ path: path.join(OUT, "07-1440-desktop-close.png") });
}

async function customer390(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}${MACHINE}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);

  await page.locator("[data-machine-view-tabs] button").filter({ hasText: "3D" }).click();
  await page.waitForTimeout(1200);
  await page.locator("canvas").first().waitFor({ state: "visible", timeout: 30_000 });
  await page.mouse.click(270, 515);
  await page.waitForTimeout(900);
  if (!(await page.locator("[data-part-sheet-title]").isVisible().catch(() => false))) {
    await page.mouse.click(270, 515);
    await page.waitForTimeout(900);
  }
  const title = (await page.locator("[data-part-sheet-title]").textContent().catch(() => "")) ?? "";
  const chipBox = await box(page.locator("[data-part-sheet] .part-sheet-chip"));
  const reset = page.getByRole("button", { name: /Reset/i }).first();
  const resetBox = await box(reset);
  const sheetCoversReset =
    chipBox && resetBox
      ? chipBox.y < resetBox.y + resetBox.height && chipBox.y + chipBox.height > resetBox.y
      : null;
  measures.push({
    item: 1,
    tag: "390",
    title: title.trim(),
    motorNotSubPart: /motor/i.test(title) && !/pinion|harness|brush/i.test(title),
    chipBox,
    resetBox,
    sheetCoversReset,
    bottomGap: chipBox ? 844 - (chipBox.y + chipBox.height) : null,
  });
  await page.screenshot({ path: path.join(OUT, "01-390-motor-tap-515.png") });

  const more = page.getByRole("button", { name: "More" });
  if (await more.isVisible().catch(() => false)) {
    await more.click();
    await page.waitForTimeout(300);
    const explode = page.locator(".explode-slider, [data-viewer-chrome-control]").first();
    measures.push({
      item: 2,
      tag: "390",
      moreExpanded: true,
      chipBoxAfterMore: await box(page.locator("[data-part-sheet] .part-sheet-chip")),
      resetBox: await box(reset),
    });
    await page.screenshot({ path: path.join(OUT, "02-390-more-peek.png") });
  }

  await page.locator("[data-machine-view-tabs] button").filter({ hasText: "List" }).click();
  await page.waitForTimeout(400);
  await expandMotorTree(page);
  const childRows = page.locator("[data-manual-sub-part] .bom-data-row--grid");
  const heights = [];
  const count = await childRows.count();
  for (let i = 0; i < count; i += 1) {
    const h = (await box(childRows.nth(i)))?.height;
    if (h != null) {
      heights.push(h);
    }
  }
  measures.push({
    item: 4,
    tag: "390",
    childRowHeights: heights,
    uniformChildRows: heights.length > 0 && Math.max(...heights) - Math.min(...heights) < 2,
  });
  await page.screenshot({ path: path.join(OUT, "04-390-row-heights.png") });

  const inner = page.locator("[data-manual-sub-part] .bom-tree-child-inner").first();
  const innerBox = await box(inner);
  measures.push({
    item: 9,
    tag: "390",
    childInnerBox: innerBox,
    paddingLeft: innerBox
      ? await inner.evaluate((el) => getComputedStyle(el).paddingLeft)
      : null,
  });
  await page.screenshot({ path: path.join(OUT, "09-390-indent.png") });
}

async function staffFlows(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}${MACHINE}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);
  await expandMotorTree(page);
  const motorLi = page.locator("li.bom-tree-parent-li").filter({ hasText: /motor/i }).first();
  await motorLi.click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Edit sub-parts" }).click();
  await page.waitForTimeout(400);
  await page.keyboard.press("Tab");
  await page.waitForTimeout(100);
  const firstTabCancel = await page
    .locator("[data-staff-manual-sub-cancel]")
    .evaluate((el) => el === document.activeElement);
  measures.push({ item: 5, tag: "1440", firstTabCancel });
  await page.screenshot({ path: path.join(OUT, "05-1440-editor-tab.png") });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  const washer390 = async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}${MACHINE}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(600);
    const washer = page.locator("[data-staff-parts] li").filter({ hasText: /washer/i }).first();
    const qtyCol = washer.locator(".bom-qty-col").first();
    measures.push({
      item: 8,
      tag: "390",
      washerQtyText: (await qtyCol.textContent())?.trim(),
      washerQtyBox: await box(qtyCol),
    });
    await page.screenshot({ path: path.join(OUT, "08-390-flat-washer-qty.png") });
  };
  await washer390();
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await login(page, customer);
    await customer1440(page);
    await customer390(page);

    await context.clearCookies();
    await login(page, staff);
    await staffFlows(page);
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
