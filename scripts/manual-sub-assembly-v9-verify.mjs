/**
 * v9 checklist: rects + screenshots for PR #449.
 * Usage: OEE360_BASE_URL=http://127.0.0.1:3010 node scripts/manual-sub-assembly-v9-verify.mjs
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
  process.env.V9_MEDIA_OUT ??
  "/cursor/stores/bc-7479d24f-d92e-51f0-ab53-0ec629d66015/media/manual-sub-assembly-refine-v9";
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
      item: "v8-1",
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
      item: "v8-1",
      tag,
      phase: `close-${i}`,
      dockBox: await box(dock),
      dataTray: await grid.getAttribute("data-tray"),
      headerName: await box(headerName),
    });
    await page.screenshot({
      path: path.join(OUT, `v8-01-drawer-cycle-${tag}-${i}.png`),
    });
  }
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(900);
  measures.push({
    item: "v8-1",
    tag,
    phase: "after-reload",
    header: await box(page.locator(".spares-header")),
    headerName: await box(headerName),
  });
  await page.screenshot({ path: path.join(OUT, `v8-01-after-reload-${tag}.png`) });
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

  const sheet = page.locator("[data-part-sheet] .part-sheet-chip");
  const more = page.getByRole("button", { name: "More" });
  const sheetBox = await box(sheet);
  const moreBox = await box(more);
  measures.push({
    item: "v8-2",
    tag: "1440",
    sheetBox,
    moreBox,
    moreInsideSheet:
      sheetBox && moreBox
        ? moreBox.y + moreBox.height <= sheetBox.y + sheetBox.height + 2
        : null,
  });
  await page.screenshot({ path: path.join(OUT, "v8-02-3d-card-actions-1440.png") });

  await expandMotorTree(page);
  const sub = page.locator("[data-manual-sub-part]").first();
  if (await sub.isVisible().catch(() => false)) {
    await sub.click();
    await page.waitForTimeout(400);
  }
  const headerAdd = page.locator(".part-sheet-header").getByRole("button", { name: "Add" });
  measures.push({
    item: 5,
    tag: "1440",
    headerAddVisible: await headerAdd.isVisible().catch(() => false),
    headerAddBox: await box(headerAdd),
  });
  await page.screenshot({ path: path.join(OUT, "05-desktop-subpart-header-add-1440.png") });

  const parentRow = page.locator("li.bom-tree-parent-li").first();
  const childRow = page.locator("[data-manual-sub-part]").first();
  measures.push({
    item: 3,
    tag: "1440",
    parentRowH: (await box(parentRow))?.height,
    childRowH: (await box(childRow))?.height,
  });
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

  const canvas = page.locator("canvas").first();
  const canvasBox = await box(canvas);
  if (canvasBox) {
    await page.mouse.click(
      canvasBox.x + canvasBox.width * 0.5,
      canvasBox.y + canvasBox.height * 0.42,
    );
    await page.waitForTimeout(500);
  }
  const title = await page.locator("[data-part-sheet-title]").textContent().catch(() => "");
  measures.push({
    item: "v8-3",
    tag: "390",
    motorNotHarness: !/harness/i.test(title ?? ""),
    canvasBox,
  });
  await page.screenshot({ path: path.join(OUT, "v8-03-390-motor-pick-3d.png") });

  await page.locator("[data-machine-view-tabs] button").filter({ hasText: "List" }).click();
  await page.waitForTimeout(400);
  await expandMotorTree(page);
  const motorRow = page.locator("li.bom-tree-parent-li").filter({ hasText: /motor/i }).first();
  await motorRow.click();
  await page.waitForTimeout(400);
  await page.locator("[data-machine-view-tabs] button").filter({ hasText: "3D" }).click();
  await page.waitForTimeout(800);

  const chip = page.locator("[data-part-sheet] .part-sheet-chip");
  const chipBox = await box(chip);
  const chipMetrics = await chip.evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
    overflowY: getComputedStyle(el).overflowY,
  }));
  const more = page.getByRole("button", { name: "More" });
  const add = page.getByRole("button", { name: "Add" }).first();
  const moreBox = await box(more);
  const addBox = await box(add);
  const viewportH = 844;
  measures.push({
    item: 1,
    tag: "390",
    chipBox,
    chipMetrics,
    moreBox,
    addBox,
    moreInViewport: moreBox ? moreBox.y + moreBox.height <= viewportH : null,
    addInViewport: addBox ? addBox.y + addBox.height <= viewportH : null,
    deadBelowCard:
      chipBox ? viewportH - (chipBox.y + chipBox.height) : null,
  });
  await page.screenshot({ path: path.join(OUT, "01-390-3d-card-sized-390.png") });

  await page.locator("[data-machine-view-tabs] button").filter({ hasText: "List" }).click();
  await page.waitForTimeout(400);
  await expandMotorTree(page);
  const parentRow = page.locator("li.bom-tree-parent-li").filter({ hasText: /motor/i }).first();
  const childRow = page.locator("[data-manual-sub-part]").first();
  measures.push({
    item: 3,
    tag: "390",
    parentRowH: (await box(parentRow))?.height,
    childRowH: (await box(childRow))?.height,
  });
  await page.screenshot({ path: path.join(OUT, "03-390-row-heights-390.png") });

  const nameCell = page.locator(".bom-tree-name .bom-row-text").first();
  measures.push({ item: 7, tag: "390", nameCell: await box(nameCell) });
  await page.screenshot({ path: path.join(OUT, "07-390-name-column-390.png") });
}

async function staffFocusTrap(page, width, tag) {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  await page.goto(`${BASE}${MACHINE}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  if (width === 390) {
    await page.locator("[data-machine-view-tabs] button").filter({ hasText: "List" }).click();
    await page.waitForTimeout(400);
    await expandMotorTree(page);
    await page.locator("li.bom-tree-parent-li").filter({ hasText: /motor/i }).first().click();
    await page.waitForTimeout(400);
    await page.locator("[data-machine-view-tabs] button").filter({ hasText: "3D" }).click();
    await page.waitForTimeout(800);
    const more = page.getByRole("button", { name: "More" });
    if (await more.isVisible().catch(() => false)) {
      await more.click();
      await page.waitForTimeout(200);
    }
    const editSubSheet = page
      .locator("[data-part-sheet]")
      .getByRole("button", { name: "Edit sub-parts" });
    if (await editSubSheet.isVisible().catch(() => false)) {
      await editSubSheet.click();
    } else {
      measures.push({ item: 2, tag, skipped: "edit sub-parts not in sheet" });
      return;
    }
  } else {
    await expandMotorTree(page);
    const motorLi = page.locator("li.bom-tree-parent-li").filter({ hasText: /motor/i }).first();
    await motorLi.click();
    await page.waitForTimeout(400);
    const editSub = page.getByRole("button", { name: "Edit sub-parts" });
    await editSub.scrollIntoViewIfNeeded().catch(() => {});
    if (!(await editSub.isVisible().catch(() => false))) {
      measures.push({ item: 2, tag, skipped: "edit sub-parts not visible" });
      return;
    }
    await editSub.click();
  }
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, `02-staff-editor-open-${tag}.png`) });

  const scrollBefore = await page.evaluate(() => ({
    window: window.scrollY,
    bom: document.querySelector(".machine-bom-scroll")?.scrollTop ?? 0,
  }));
  await page.keyboard.press("Tab");
  await page.waitForTimeout(100);
  const cancel = page.locator("[data-staff-manual-sub-cancel]");
  const firstTabCancel = await cancel.evaluate((el) => el === document.activeElement);
  const tabStaysInEditor = await page.evaluate(() => {
    const root = document.querySelector("[data-staff-manual-sub]");
    return Boolean(root && root.contains(document.activeElement));
  });

  let tabCount = 0;
  let escapedEditor = false;
  for (let i = 0; i < (tag === "1440" ? 20 : 12); i += 1) {
    await page.keyboard.press("Tab");
    tabCount += 1;
    const inside = await page.evaluate(() => {
      const root = document.querySelector("[data-staff-manual-sub]");
      return Boolean(root && root.contains(document.activeElement));
    });
    if (!inside) {
      escapedEditor = true;
      break;
    }
  }

  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  const scrollAfterEscape = await page.evaluate(() => ({
    window: window.scrollY,
    bom: document.querySelector(".machine-bom-scroll")?.scrollTop ?? 0,
  }));
  const editorOpen = await page.locator("[data-staff-manual-sub]").isVisible().catch(() => false);

  measures.push({
    item: 2,
    tag,
    firstTabCancel,
    tabStaysInEditorAfterFirst: tabStaysInEditor,
    tabCountBeforeEscape: tabCount,
    escapedEditor,
    scrollBefore,
    scrollAfterEscape,
    scrollDelta:
      scrollAfterEscape.window -
      scrollBefore.window +
      (scrollAfterEscape.bom - scrollBefore.bom),
    editorClosedAfterEscape: !editorOpen,
  });
  await page.screenshot({ path: path.join(OUT, `02-staff-after-escape-${tag}.png`) });
}

async function staffWasher(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}${MACHINE}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);
  const washer = page.locator("li.bom-tree-parent-li").filter({ hasText: /washer/i }).first();
  if (await washer.isVisible().catch(() => false)) {
    const status = washer.locator(".bom-qty-col").first();
    const statusBox = await box(status);
    const text = await status.textContent();
    measures.push({
      item: 4,
      tag: "1440",
      statusText: text?.trim(),
      statusBox,
      clipped: statusBox ? statusBox.width < 44 : null,
    });
    await page.screenshot({ path: path.join(OUT, "04-staff-washer-missing-mesh-1440.png") });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}${MACHINE}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);
  const washer390 = page.locator("li.bom-tree-parent-li").filter({ hasText: /washer/i }).first();
  if (await washer390.isVisible().catch(() => false)) {
    const status = washer390.locator(".bom-qty-col").first();
    measures.push({
      item: 4,
      tag: "390",
      statusBox: await box(status),
      statusText: (await status.textContent())?.trim(),
    });
    await page.screenshot({ path: path.join(OUT, "04-staff-washer-missing-mesh-390.png") });
  }
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
    await staffFocusTrap(page, 1440, "1440");
    await staffFocusTrap(page, 390, "390");
    await staffWasher(page);
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
