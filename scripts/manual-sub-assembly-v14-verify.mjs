/**
 * v14 checklist: rects + screenshots + motor tap battery for PR #449.
 * Usage: OEE360_BASE_URL=https://spares-git-…vercel.app node scripts/manual-sub-assembly-v14-verify.mjs
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
  process.env.V14_MEDIA_OUT ??
  "/cursor/stores/self/media/manual-sub-assembly-refine-v14";
const MACHINE = "/machines/hardware-fixture";
const TAP_COORDS = [
  [270, 515],
  [262, 495],
  [278, 525],
];
const TAP_ROUNDS = Number(process.env.MOTOR_TAP_ROUNDS ?? "6");

const customer = { email: "customer@spares.local", password: "SparesCustomer1!" };
const staff = { email: "staff@spares.local", password: "SparesStaff1!" };

fs.mkdirSync(OUT, { recursive: true });

const measures = [];
const previewHost = BASE.includes("vercel.app");

function machineLoginCreds() {
  return previewHost ? staff : customer;
}

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
  await page.goto(`${BASE}/machines`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(400);
}

async function goListBom(page) {
  const listTab = page.locator("[data-machine-view-tabs] button").filter({ hasText: "List" });
  if (await listTab.isVisible().catch(() => false)) {
    await listTab.click();
    await page.waitForTimeout(450);
  }
}

async function goModel3D(page) {
  const tab = page.locator("[data-machine-view-tabs] button").filter({ hasText: "3D" });
  if (await tab.isVisible().catch(() => false)) {
    await tab.click();
    await page.waitForTimeout(700);
  }
}

async function expandMotorTree(page) {
  const motor = page.getByRole("button", { name: /Expand \d+ sub-part/i }).first();
  if (await motor.isVisible().catch(() => false)) {
    await motor.click();
  }
}

async function subSheetScrollMetrics(page) {
  const sheet = page.locator("[data-manual-sub-sheet]").first();
  if (!(await sheet.isVisible().catch(() => false))) {
    return null;
  }
  return await sheet.evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
    overflowY: getComputedStyle(el).overflowY,
  }));
}

async function openMachine(page) {
  await page.goto(`${BASE}${MACHINE}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  const tabs = page.locator("[data-machine-view-tabs]");
  if (await tabs.isVisible({ timeout: 15_000 }).catch(() => false)) {
    return;
  }
  await page.waitForTimeout(2000);
}

async function dismissPartSheet(page) {
  const close = page.locator("[data-part-sheet-close]");
  if (await close.isVisible().catch(() => false)) {
    await close.click({ force: true });
    await page.waitForTimeout(350);
  }
}

function motorTitleOk(title) {
  return /motor/i.test(title) && !/pinion|harness|brush/i.test(title);
}

async function motorTapBattery(page, tag) {
  await goModel3D(page);
  await page.locator("canvas").first().waitFor({ state: "visible", timeout: 30_000 });
  const results = [];
  for (let round = 1; round <= TAP_ROUNDS; round += 1) {
    for (const [x, y] of TAP_COORDS) {
      await dismissPartSheet(page);
      await page.waitForTimeout(180);
      await page.mouse.click(x, y);
      await page.waitForTimeout(750);
      let title =
        (await page.locator("[data-part-sheet-title]").textContent().catch(() => "")) ?? "";
      if (!motorTitleOk(title)) {
        await page.mouse.click(x, y);
        await page.waitForTimeout(750);
        title =
          (await page.locator("[data-part-sheet-title]").textContent().catch(() => "")) ?? "";
      }
      results.push({
        round,
        x,
        y,
        pass: motorTitleOk(title),
        title: title.trim(),
      });
    }
  }
  const passCount = results.filter((row) => row.pass).length;
  measures.push({
    item: "motor-tap",
    tag,
    passCount,
    total: results.length,
    rounds: TAP_ROUNDS,
    results,
  });
  return passCount;
}

async function customer1440(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openMachine(page);

  await goListBom(page);
  await expandMotorTree(page);
  const listPinion = page
    .locator("[data-manual-sub-part]")
    .filter({ hasText: /pinion/i })
    .first();
  const listPinionName = await box(listPinion.locator(".bom-row-text > span:first-child").first());
  measures.push({
    item: 8,
    tag: "1440-list",
    listPinionNameWidth: listPinionName?.width,
  });
  const motorLi = page.locator("li.bom-tree-parent-li").filter({ hasText: /motor/i }).first();
  await motorLi.waitFor({ state: "visible", timeout: 25_000 });
  await motorLi.click();
  await goModel3D(page);

  const sheetRoot = page.locator("[data-part-sheet]");
  const pinionRow = sheetRoot
    .locator("[data-manual-sub-part]")
    .filter({ hasText: /pinion/i })
    .first();
  const pinionAdds = pinionRow.getByRole("button", { name: "Add", exact: true });
  const subAdds = sheetRoot.locator("[data-manual-sub-sheet]").getByRole("button", {
    name: "Add",
    exact: true,
  });
  measures.push({
    item: 5,
    tag: "1440",
    pinionAddCount: await pinionAdds.count(),
    subPartAddCount: await subAdds.count(),
    subSheetScroll: await subSheetScrollMetrics(page),
  });
  await page.screenshot({ path: path.join(OUT, "05-1440-pinion-adds-preview.png") });

  await pinionRow.click();
  await page.waitForTimeout(350);
  const back = page.locator("[data-part-sheet-back-motor]");
  const backBox = await box(back);
  const backText = (await back.textContent())?.trim() ?? "";
  const nameSpan = pinionRow.locator(".bom-row-text > span:first-child").first();
  const nameBox = await box(nameSpan);
  measures.push({
    item: 8,
    tag: "1440",
    backBox,
    backText,
    backTruncated: backText.includes("…"),
    pinionNameWidth: nameBox?.width,
  });
  await page.screenshot({ path: path.join(OUT, "08-1440-back-preview.png") });
}

async function customer390(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await openMachine(page);

  const passCount = await motorTapBattery(page, "390-customer");
  await page.screenshot({ path: path.join(OUT, "01-390-motor-tap-battery.png") });

  await dismissPartSheet(page);
  await page.mouse.click(270, 515);
  await page.waitForTimeout(800);
  const title = (await page.locator("[data-part-sheet-title]").textContent().catch(() => "")) ?? "";
  const chipBox = await box(page.locator("[data-part-sheet] .part-sheet-chip"));
  const reset = page.getByRole("button", { name: /Reset/i }).first();
  const resetBox = await box(reset);
  const sheetCoversReset =
    chipBox && resetBox
      ? chipBox.y < resetBox.y + resetBox.height && chipBox.y + chipBox.height > resetBox.y
      : null;
  const viewerBottomInset = await page
    .locator("[data-machine-viewer-layout]")
    .getAttribute("data-viewer-bottom-inset");
  measures.push({
    item: 1,
    tag: "390",
    motorTapPassCount: passCount,
    title: title.trim(),
    motorNotSubPart: motorTitleOk(title),
    chipBox,
    resetBox,
    sheetCoversReset,
    bottomGap: chipBox ? 844 - (chipBox.y + chipBox.height) : null,
    viewerBottomInset: viewerBottomInset ? Number(viewerBottomInset) : 0,
    subSheetScroll: await subSheetScrollMetrics(page),
  });
  await page.screenshot({ path: path.join(OUT, "02-390-motor-sheet.png") });

  const pinionAdds = page
    .locator("[data-part-sheet] [data-manual-sub-part]")
    .filter({ hasText: /pinion/i })
    .getByRole("button", { name: "Add", exact: true });
  measures.push({
    item: 5,
    tag: "390",
    pinionAddCount: await pinionAdds.count(),
  });

  const more = page.getByRole("button", { name: "More" });
  if (await more.isVisible().catch(() => false)) {
    await more.click();
    await page.waitForTimeout(300);
    const chip = page.locator("[data-part-sheet] .part-sheet-chip");
    const chipBoxAfter = await box(chip);
    const panel = page.locator("[data-part-sheet-more-panel]");
    const panelBox = await box(panel);
    measures.push({
      item: 3,
      tag: "390",
      moreInsideChip:
        chipBoxAfter && panelBox
          ? panelBox.y + panelBox.height <= chipBoxAfter.y + chipBoxAfter.height + 4
          : null,
      chipBoxAfter,
      panelBox,
      sheetCoversResetAfterMore:
        chipBoxAfter && resetBox
          ? chipBoxAfter.y < resetBox.y + resetBox.height &&
            chipBoxAfter.y + chipBoxAfter.height > resetBox.y
          : null,
    });
    await page.screenshot({ path: path.join(OUT, "03-390-more-contained.png") });
  }

  const rowHeights = [];
  const rows = page.locator(
    "[data-manual-sub-sheet] [data-manual-sub-part] .bom-data-row--grid",
  );
  const rowCount = await rows.count();
  for (let i = 0; i < rowCount; i += 1) {
    const h = (await box(rows.nth(i)))?.height;
    if (h != null) {
      rowHeights.push(h);
    }
  }
  measures.push({
    item: 7,
    tag: "390",
    childRowHeights: rowHeights,
    childRowHeightMeasured: rowHeights[0] ?? null,
    uniform64:
      rowHeights.length > 0 &&
      rowHeights.every((h) => h >= 63.5 && h <= 64.5),
  });
  await page.screenshot({ path: path.join(OUT, "07-390-sheet-row-heights.png") });
}

async function customer1024Quote(page) {
  await page.setViewportSize({ width: 1024, height: 900 });
  await openMachine(page);
  await goModel3D(page);
  await dismissPartSheet(page);
  await page.mouse.click(270, 515);
  await page.waitForTimeout(700);
  const add = page.getByRole("button", { name: "Add", exact: true }).first();
  if (await add.isVisible().catch(() => false)) {
    await add.click();
    await page.waitForTimeout(450);
  }
  const quoteBtn = page
    .locator("[data-viewer-chrome-toolbar] [data-quote-tray]")
    .filter({ hasText: "Quote" })
    .first();
  await quoteBtn.click();
  await page.waitForTimeout(650);
  const sheet = page.locator(".machine-viewer .quote-sheet").first();
  const sheetBox = await box(sheet);
  const cls = (await sheet.getAttribute("class")) ?? "";
  measures.push({
    item: 4,
    tag: "1024",
    isOut: cls.includes("is-out"),
    sheetY: sheetBox?.y ?? null,
    quoteOpens: Boolean(sheetBox && sheetBox.y < 850 && !cls.includes("is-out")),
  });
  await page.screenshot({ path: path.join(OUT, "10-1024-quote-sheet.png") });
}

async function staffFlows(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await openMachine(page);
  await goListBom(page);
  await expandMotorTree(page);
  await page.locator("li.bom-tree-parent-li").filter({ hasText: /motor/i }).first().click();
  await goModel3D(page);
  const editBtn = page.locator("[data-part-sheet-edit-sub-parts]");
  measures.push({
    item: 4,
    tag: "390-staff",
    editVisibleWithoutMore: await editBtn.isVisible().catch(() => false),
  });
  await page.screenshot({ path: path.join(OUT, "04-390-staff-edit-entry.png") });
  if (await editBtn.isVisible().catch(() => false)) {
    await editBtn.click();
    await page.waitForTimeout(400);
    await page.keyboard.press("Tab");
    await page.waitForTimeout(100);
    const firstTabCancel = await page
      .locator("[data-staff-manual-sub-cancel]")
      .evaluate((el) => el === document.activeElement);
    measures.push({ item: 4, tag: "390-staff", firstTabCancel });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await openMachine(page);
  await expandMotorTree(page);
  await page.locator("li.bom-tree-parent-li").filter({ hasText: /motor/i }).first().click();
  await goModel3D(page);
  const staffSheetAdds = page.locator("[data-part-sheet]").getByRole("button", {
    name: "Add",
    exact: true,
  });
  measures.push({
    item: "pinion-staff",
    tag: "1440",
    staffAddCount: await staffSheetAdds.count(),
    note: "Staff preview: Add on sub-rows is customer-only by design",
  });
  await page.screenshot({ path: path.join(OUT, "06-1440-staff-no-adds.png") });

  await goListBom(page);
  await page.getByRole("button", { name: "Edit sub-parts" }).first().click();
  await page.waitForTimeout(400);
  await page.keyboard.press("Tab");
  await page.waitForTimeout(100);
  const firstTabCancelList = await page
    .locator("[data-staff-manual-sub-cancel]")
    .evaluate((el) => el === document.activeElement);
  measures.push({ item: 4, tag: "1440-staff-list", firstTabCancel: firstTabCancelList });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: "Edit sub-parts" }).first().click();
  await page.waitForTimeout(400);
  const up = page.getByRole("button", { name: "Move up" }).first();
  const tabIndexUp = await up.getAttribute("tabindex");
  measures.push({
    item: 9,
    tag: "1440",
    reorderTabIndex: tabIndexUp,
    qtyAria: await page.locator('input[aria-label="Quantity"]').count(),
  });
  await page.screenshot({ path: path.join(OUT, "09-1440-editor-a11y.png") });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    const machineCreds = machineLoginCreds();
    await login(page, machineCreds);
    if (previewHost && machineCreds === staff) {
      measures.push({
        item: "preview-note",
        tag: "auth",
        note: "Preview uses staff for hardware-fixture + R2 GLB; customer Add counts need local seed",
      });
    }
    await customer1024Quote(page);
    await customer1440(page);
    await customer390(page);

    if (machineCreds !== staff) {
      await context.clearCookies();
      await login(page, staff);
    }
    await staffFlows(page);
  } finally {
    fs.writeFileSync(path.join(OUT, "measures.json"), JSON.stringify(measures, null, 2));
    await browser.close();
  }
  console.log(JSON.stringify({ out: OUT, base: BASE, measures }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
