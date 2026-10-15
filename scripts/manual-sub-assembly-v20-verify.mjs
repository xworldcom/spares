/**
 * v20 checklist: v19 KEEP + mobile touch Back + keyboard BOM @ pointer:none.
 * Usage: OEE360_BASE_URL=http://localhost:3010 node scripts/manual-sub-assembly-v20-verify.mjs
 */
import { createRequire } from "node:module";
const require = createRequire(
  new URL("../.cursor/skills/verify-oee360/scripts/package.json", import.meta.url),
);
const { chromium, webkit } = require("playwright");
import fs from "node:fs";
import path from "node:path";

/** Use localhost (not 127.0.0.1) so GLB fetches stay same-origin with the app. */
const BASE = process.env.OEE360_BASE_URL ?? "http://localhost:3010";
const OUT =
  process.env.V20_MEDIA_OUT ??
  "/cursor/stores/bc-7479d24f-d92e-51f0-ab53-0ec629d66015/media/manual-sub-assembly-refine-v20";
const MACHINE = "/machines/hardware-fixture";
const TAP_COORDS = [
  [270, 515],
  [262, 495],
  [278, 525],
];
const PEEK_TAP_COORDS = [
  [60, 767],
  [275, 767],
  [300, 767],
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

function bomSection(page) {
  return page.locator("[data-parts-bom]").first();
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
  const chevron = page.locator("button.bom-tree-chevron[aria-expanded]").first();
  if (await chevron.isVisible().catch(() => false)) {
    const expanded = await chevron.getAttribute("aria-expanded");
    if (expanded !== "true") {
      await chevron.click({ force: true });
      await page.waitForTimeout(350);
    }
  }
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
  const t = title.toLowerCase();
  return t.includes("motor") && !t.includes("pinion") && !t.includes("harness");
}

function harnessTitle(title) {
  return /harness/i.test(title);
}

async function motorTapBattery(page, tag) {
  let pass = 0;
  for (const [x, y] of TAP_COORDS) {
    let coordPass = 0;
    for (let i = 0; i < TAP_ROUNDS; i += 1) {
      await dismissPartSheet(page);
      await page.mouse.click(x, y);
      await page.waitForTimeout(450);
      const title =
        (await page.locator("[data-part-sheet-title]").textContent().catch(() => "")) ?? "";
      if (motorTitleOk(title)) {
        coordPass += 1;
        pass += 1;
      }
    }
    measures.push({ item: "motor-tap", tag, coord: [x, y], pass: coordPass, rounds: TAP_ROUNDS });
  }
  return pass;
}

async function layoutCanvasBox(page) {
  return page.evaluate(() => {
    const layout = document.querySelector("[data-machine-viewer-layout]");
    const canvas = layout?.querySelector("canvas");
    if (!layout || !canvas) {
      return null;
    }
    const lr = layout.getBoundingClientRect();
    const cr = canvas.getBoundingClientRect();
    return {
      layout: { w: lr.width, h: lr.height, top: lr.top, left: lr.left },
      canvas: { w: cr.width, h: cr.height, top: cr.top, left: cr.left },
    };
  });
}

async function measureListRowHeights(page, tag) {
  const heights = await page.evaluate(() => {
    const root =
      document.querySelector("[data-staff-parts]") ??
      document.querySelector("[data-parts-bom]");
    if (!root) {
      return { rows: [], ok: false };
    }
    const rowEls = [
      ...root.querySelectorAll(
        "li.bom-tree-parent-li .bom-data-row--grid, [data-manual-sub-part] .bom-data-row--grid",
      ),
    ];
    const rows = rowEls.map((el) => {
      const r = el.getBoundingClientRect();
      const label = (el.textContent ?? "").slice(0, 40);
      return { height: r.height, label };
    });
    const childRows = rows.filter((r) =>
      /pinion|harness|brush/i.test(r.label),
    );
    const singleLineParents = rows.filter(
      (r) =>
        !/pinion|harness|brush/i.test(r.label) &&
        !/discontinued|unknown/i.test(r.label) &&
        !/bearing.*22 mm/i.test(r.label),
    );
    const ok =
      rows.length > 0 &&
      childRows.every((r) => r.height >= 63.5 && r.height <= 68.5) &&
      singleLineParents.every((r) => r.height >= 63.5 && r.height <= 68.5);
    return { rows, ok };
  });
  measures.push({ item: "row-heights", tag, ...heights });
  return heights.ok;
}

async function measureListRowOverlap(page, tag, screenshotName) {
  const root = page.locator("[data-staff-parts], [data-parts-bom]").first();
  await root.scrollIntoViewIfNeeded().catch(() => {});
  const overlap = await page.evaluate(() => {
    const root =
      document.querySelector("[data-staff-parts]") ??
      document.querySelector("[data-parts-bom]");
    if (!root) {
      return { overlap: true, rowCount: 0, rows: [] };
    }
    const motorLi = [...root.querySelectorAll("li.bom-tree-parent-li")].find((li) =>
      /motor/i.test(li.textContent ?? ""),
    );
    if (!motorLi) {
      return { overlap: true, rowCount: 0, rows: [] };
    }
    const block = motorLi.parentElement?.closest("ul") ?? root;
    const rowEls = [
      ...block.querySelectorAll(
        "li.bom-tree-parent-li .bom-data-row--grid, [data-manual-sub-part] .bom-data-row--grid",
      ),
    ].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.height > 8 && r.width > 8;
    });
    const rows = rowEls.map((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, height: r.height };
    });
    rows.sort((a, b) => a.top - b.top);
    let overlap = false;
    for (let i = 0; i < rows.length - 1; i += 1) {
      if (rows[i].bottom > rows[i + 1].top + 1) {
        overlap = true;
      }
    }
    const labeled = rowEls.map((el) => {
      const r = el.getBoundingClientRect();
      return { height: r.height, label: (el.textContent ?? "").slice(0, 48) };
    });
    const childRows = labeled.filter((r) => /pinion|harness|brush/i.test(r.label));
    const singleLineParents = labeled.filter(
      (r) =>
        !/pinion|harness|brush/i.test(r.label) &&
        !/discontinued|unknown/i.test(r.label) &&
        !/bearing.*22 mm/i.test(r.label),
    );
    const minHeightsOk =
      labeled.length > 0 &&
      childRows.every((r) => r.height >= 63.5 && r.height <= 68.5) &&
      singleLineParents.every((r) => r.height >= 63.5 && r.height <= 68.5);
    return { overlap, rowCount: rows.length, rows, minHeightsOk };
  });
  measures.push({ item: "list-row-overlap", tag, ...overlap });
  if (screenshotName) {
    await page.screenshot({ path: path.join(OUT, screenshotName), fullPage: false });
  }
  return overlap;
}

/** HIGH 1 — list tappable after closing 3D part sheet */
async function listAfter3DClose(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await openMachine(page);
  await goModel3D(page);
  await page.mouse.click(270, 515);
  await page.waitForTimeout(600);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  await goListBom(page);
  const blocked = await bomSection(page).getAttribute("data-bom-list-blocked");
  const listRow = page
    .locator("[data-staff-parts] .bom-data-row--hit, [data-parts-bom] .bom-data-row--hit")
    .filter({ hasText: /bearing|washer|motor/i })
    .first();
  await listRow.scrollIntoViewIfNeeded().catch(() => {});
  let tapped = false;
  if (await listRow.isVisible().catch(() => false)) {
    const rowBox = await box(listRow);
    if (rowBox) {
      await page.touchscreen.tap(
        rowBox.x + rowBox.width / 2,
        rowBox.y + rowBox.height / 2,
      );
    } else {
      await listRow.click({ force: true });
    }
    await page.waitForTimeout(500);
    const title =
      (await page.locator("[data-part-sheet-title]").textContent().catch(() => "")) ?? "";
    tapped = Boolean(title.trim());
  }
  measures.push({
    item: 1,
    tag: "webkit-390",
    listBlockedAttr: blocked,
    washerTapOpens: tapped,
    pass: blocked === null && tapped,
  });
  await page.screenshot({ path: path.join(OUT, "390-list-after-3d-close.png") });
}

async function openMotorCompactPeek(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await openMachine(page);
  await goListBom(page);
  await expandMotorTree(page);
  const motorRow = page
    .locator("[data-staff-parts] .bom-data-row--hit, [data-parts-bom] .bom-data-row--hit")
    .filter({ hasText: /motor/i })
    .first();
  await motorRow.scrollIntoViewIfNeeded().catch(() => {});
  const motorBox = await box(motorRow);
  if (motorBox) {
    await page.touchscreen.tap(motorBox.x + motorBox.width / 2, motorBox.y + motorBox.height / 2);
  } else {
    await motorRow.click({ force: true });
  }
  await page.waitForSelector("[data-part-sheet-chip]", { timeout: 12_000 });
  await page.waitForTimeout(350);
  const compactAttr = await page
    .locator("[data-part-sheet-chip]")
    .getAttribute("data-part-sheet-compact")
    .catch(() => null);
  return { compact: compactAttr !== null };
}

function isCompactChipAttr(value) {
  return value !== null;
}

/** HIGH 2 — peek summary touch must not open harness */
async function peekSummaryTouch(page) {
  const { compact } = await openMotorCompactPeek(page);
  const results = [];
  for (const [x, y] of PEEK_TAP_COORDS) {
    await openMotorCompactPeek(page);
    const summary = page.locator("[data-part-sheet-compact-summary]");
    const summaryBox = await box(summary);
    if (summaryBox) {
      await page.touchscreen.tap(
        summaryBox.x + Math.min(summaryBox.width * 0.85, summaryBox.width - 4),
        summaryBox.y + summaryBox.height / 2,
      );
    } else {
      await page.touchscreen.tap(x, y);
    }
    await page.waitForTimeout(600);
    await page
      .waitForFunction(
        () => document.querySelector("[data-part-sheet-title]")?.textContent?.trim(),
        { timeout: 4000 },
      )
      .catch(() => {});
    const title =
      (await page.locator("[data-part-sheet-title]").textContent().catch(() => "")) ?? "";
    const detail =
      (await page.locator("[data-part-sheet-detail]").first().textContent().catch(() => "")) ??
      "";
    const chipVisible = await page.locator("[data-part-sheet-chip]").isVisible().catch(() => false);
    const compactAttr = chipVisible
      ? await page.locator("[data-part-sheet-chip]").getAttribute("data-part-sheet-compact")
      : null;
    const expanded = chipVisible && !isCompactChipAttr(compactAttr);
    const wrongChild = harnessTitle(title) || /6331K32-LEAD/i.test(detail);
    const sheetOpen = await page.locator("[data-part-sheet]").isVisible().catch(() => false);
    results.push({
      coord: [x, y],
      title: title.trim(),
      detail: detail.trim(),
      expanded,
      wrongChild,
      sheetOpen,
      pass:
        sheetOpen &&
        !wrongChild &&
        (motorTitleOk(title) || (expanded && !harnessTitle(title))),
    });
  }
  const pass = results.every((r) => r.pass);
  measures.push({ item: 2, tag: "webkit-390-touch", compactAtStart: compact, results, pass });
  await page.screenshot({ path: path.join(OUT, "390-peek-summary-touch.png") });
}

/** HIGH 3 — canvas box stable with list open + motor select */
async function canvasBoxListSelect(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await openMachine(page);
  await goListBom(page);
  const before = await layoutCanvasBox(page);
  const motorRow = page
    .locator("[data-staff-parts] .bom-data-row--hit, [data-parts-bom] .bom-data-row--hit")
    .filter({ hasText: /motor/i })
    .first();
  await motorRow.click();
  await page.waitForTimeout(600);
  const after = await layoutCanvasBox(page);
  const stable =
    before &&
    after &&
    Math.abs(before.layout.w - after.layout.w) < 0.5 &&
    Math.abs(before.layout.h - after.layout.h) < 0.5 &&
    Math.abs(before.canvas.w - after.canvas.w) < 0.5 &&
    Math.abs(before.canvas.h - after.canvas.h) < 0.5;
  measures.push({ item: 3, tag: "390-list", before, after, canvasBoxStable: stable, pass: stable });
  await page.screenshot({ path: path.join(OUT, "390-list-motor-canvas-box.png") });
}

/** HIGH 1 / MED 5 — touch Back from sub-part restores expanded parent motor */
async function backToExpandedParent(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await openMachine(page);
  await goListBom(page);
  await expandMotorTree(page);
  const pinion = page.locator("[data-manual-sub-part]").filter({ hasText: /pinion/i }).first();
  const pinionBox = await box(pinion);
  if (pinionBox) {
    await page.touchscreen.tap(
      pinionBox.x + pinionBox.width / 2,
      pinionBox.y + pinionBox.height / 2,
    );
  } else {
    await pinion.click({ force: true });
  }
  await page.waitForTimeout(450);
  const back = page.locator("[data-part-sheet-back-motor]");
  const backBox = await box(back);
  if (backBox) {
    await page.touchscreen.tap(
      backBox.x + backBox.width / 2,
      backBox.y + backBox.height / 2,
    );
  } else {
    await back.click({ force: true });
  }
  await page.waitForTimeout(500);
  const compactAttr = await page
    .locator("[data-part-sheet-chip]")
    .getAttribute("data-part-sheet-compact");
  const title =
    (await page.locator("[data-part-sheet-title]").textContent().catch(() => "")) ?? "";
  const pass =
    !isCompactChipAttr(compactAttr) && motorTitleOk(title) && !harnessTitle(title);
  measures.push({
    item: "HIGH-1-back-touch",
    tag: "webkit-390-touch",
    compactAfterBack: isCompactChipAttr(compactAttr),
    title: title.trim(),
    pass,
  });
  measures.push({
    item: 5,
    tag: "webkit-390-touch",
    compactAfterBack: isCompactChipAttr(compactAttr),
    title: title.trim(),
    pass,
  });
  await page.screenshot({ path: path.join(OUT, "390-back-expanded-parent-touch.png") });
}

/** MED 6 — keyboard row navigation */
async function motorTreeExpanded(page) {
  return page.evaluate(() => {
    const li = [...document.querySelectorAll("li.bom-tree-parent-li")].find((row) =>
      /miniature dc motor/i.test(row.textContent ?? ""),
    );
    const btn = li?.querySelector("button.bom-tree-chevron[aria-expanded]");
    return btn?.getAttribute("aria-expanded") === "true";
  });
}

async function keyboardBomNav(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ media: "screen", pointer: "none" });
  await openMachine(page);
  await goListBom(page);
  const parentTabStops = await page.evaluate(() => {
    const root = document.querySelector("[data-parts-bom]") ?? document.querySelector("[data-staff-parts]");
    if (!root) {
      return 0;
    }
    return root.querySelectorAll('li.bom-tree-parent-li[tabindex="0"]').length;
  });
  const firstRow = page
    .locator(
      "[data-staff-parts] li.bom-tree-parent-li[tabindex='0'], [data-parts-bom] li.bom-tree-parent-li[tabindex='0'], [data-staff-parts] .bom-data-row--hit[tabindex='0'], [data-parts-bom] .bom-data-row--hit[tabindex='0']",
    )
    .first();
  await firstRow.focus();
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(200);
  const activeTag = await page.evaluate(() => {
    const el = document.activeElement;
    if (el instanceof HTMLLIElement && el.classList.contains("bom-tree-parent-li")) {
      return "parent-li";
    }
    if (el?.getAttribute("class")?.includes("bom-data-row")) {
      return "bom-row";
    }
    return el?.tagName ?? "none";
  });
  if (await motorTreeExpanded(page)) {
    await page
      .locator("li.bom-tree-parent-li")
      .filter({ hasText: /miniature dc motor/i })
      .locator("button.bom-tree-chevron")
      .click();
    await page.waitForTimeout(200);
  }
  const motorParent = page
    .locator("li.bom-tree-parent-li[tabindex='0']")
    .filter({ hasText: /miniature dc motor/i })
    .first();
  await motorParent.focus();
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(250);
  const expanded = await motorTreeExpanded(page);
  await motorParent.focus();
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(200);
  const collapsed = !(await motorTreeExpanded(page));
  measures.push({
    item: "MED-2-keyboard",
    tag: "390-pointer-none",
    parentTabStops,
    arrowDownFocus: activeTag === "parent-li" || activeTag === "bom-row",
    arrowRightExpands: expanded,
    arrowLeftCollapses: collapsed,
    pass:
      parentTabStops > 0 &&
      (activeTag === "parent-li" || activeTag === "bom-row") &&
      expanded &&
      collapsed,
  });
  measures.push({
    item: 6,
    tag: "390-pointer-none",
    arrowDownFocus: activeTag === "parent-li" || activeTag === "bom-row",
    arrowRightExpands: expanded,
    pass: (activeTag === "parent-li" || activeTag === "bom-row") && expanded,
  });
  await page.screenshot({ path: path.join(OUT, "390-keyboard-bom-pointer-none.png") });
}

async function passiveListenerWarnings(page) {
  const warnings = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (/passive/i.test(text) && /preventDefault/i.test(text)) {
      warnings.push(text);
    }
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await openMachine(page);
  await goListBom(page);
  const motorRow = page
    .locator("[data-staff-parts] .bom-data-row--hit, [data-parts-bom] .bom-data-row--hit")
    .filter({ hasText: /motor/i })
    .first();
  await motorRow.click();
  await page.waitForTimeout(300);
  await page.touchscreen.tap(200, 760);
  await page.waitForTimeout(300);
  measures.push({ item: 7, tag: "console", passivePreventDefaultWarnings: warnings.length, pass: warnings.length === 0 });
}

async function listRowsAtViewports(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await openMachine(page);
  await goListBom(page);
  await expandMotorTree(page);
  await measureListRowOverlap(page, "390-list", "390-list-motor-rows.png");
  const ok390 = await measureListRowHeights(page, "390");

  await page.setViewportSize({ width: 1440, height: 900 });
  await openMachine(page);
  await goListBom(page);
  await expandMotorTree(page);
  await measureListRowOverlap(page, "1440-list", "1440-list-motor-rows.png");
  const ok1440 = await measureListRowHeights(page, "1440");
  measures.push({ item: 4, tag: "390+1440", ok390, ok1440, pass: ok390 && ok1440 });
}

async function compactPeekMotorVisible(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await openMachine(page);
  await goModel3D(page);
  await page
    .waitForResponse(
      (res) => res.url().includes("/hardware-fixture/file") && res.ok(),
      { timeout: 45_000 },
    )
    .catch(() => null);
  await page.mouse.click(270, 515);
  await page.waitForTimeout(700);
  const chip = page.locator("[data-part-sheet-chip]");
  const chipBox = await box(chip);
  const compact = isCompactChipAttr(await chip.getAttribute("data-part-sheet-compact"));
  const pass = compact && chipBox && chipBox.y >= 555;
  measures.push({
    item: 8,
    tag: "390-3d-compact",
    compact,
    chipTop: chipBox?.y ?? null,
    pass,
  });
  await page.screenshot({
    path: path.join(OUT, "390-compact-peek-motor-visible.png"),
    fullPage: false,
  });
}

/** HIGH A — quote peek + part sheet tappable in list; Esc fully dismisses peek */
async function listQuoteAndPeekTappable(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await openMachine(page);
  await goListBom(page);
  const listAdd = page.locator("[data-parts-bom] button.bom-add-col").first();
  if (await listAdd.isVisible().catch(() => false)) {
    const lab = await box(listAdd);
    if (lab) {
      await page.touchscreen.tap(lab.x + lab.width / 2, lab.y + lab.height / 2);
      await page.waitForTimeout(400);
    }
  }
  await expandMotorTree(page);
  const motorRow = page
    .locator("[data-parts-bom] .bom-data-row--hit")
    .filter({ hasText: /motor/i })
    .first();
  await motorRow.scrollIntoViewIfNeeded().catch(() => {});
  await page.evaluate(() => {
    const row = [...document.querySelectorAll("[data-parts-bom] .bom-data-row--hit")].find((el) =>
      /miniature dc motor/i.test(el.textContent ?? ""),
    );
    row?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await page
    .waitForSelector("[data-part-sheet-chip]", { timeout: 10_000 })
    .catch(() => null);
  await page.waitForTimeout(350);
  const sheetBeforeQuote = await page.locator("[data-part-sheet-chip]").isVisible().catch(() => false);
  const quoteBtn = page.locator("[data-viewer-chrome-toolbar] button[data-quote-tray]").first();
  const qb = await box(quoteBtn);
  if (qb) {
    await page.touchscreen.tap(qb.x + qb.width / 2, qb.y + qb.height / 2);
  }
  await page.waitForTimeout(500);
  const quotePeek = await page.locator(".quote-sheet.is-peek, .quote-sheet.is-full").isVisible().catch(() => false);
  const removeBtn = page.locator(".quote-sheet .manual-quote-remove").first();
  const removeVisible = await removeBtn.isVisible().catch(() => false);
  let removeTappable = false;
  let trayCountAfterRemove = null;
  if (removeVisible) {
    const rb = await box(removeBtn);
    if (rb) {
      await page.touchscreen.tap(rb.x + rb.width / 2, rb.y + rb.height / 2);
      await page.waitForTimeout(400);
      removeTappable = true;
      trayCountAfterRemove = await page
        .locator("[data-quote-target='badge']")
        .textContent()
        .catch(() => null);
    }
  }
  await page.keyboard.press("Escape");
  await page.waitForTimeout(350);
  const sheetAfterEsc = await page.locator("[data-part-sheet]").isVisible().catch(() => false);
  const blocked = await bomSection(page).getAttribute("data-bom-list-blocked");
  measures.push({
    item: "A-list-overlays",
    tag: "webkit-390",
    sheetBeforeQuote,
    quotePeek,
    removeVisible,
    removeTappable,
    trayCountAfterRemove,
    sheetAfterEsc,
    listBlockedAttr: blocked,
    pass:
      sheetBeforeQuote &&
      quotePeek &&
      removeVisible &&
      removeTappable &&
      sheetAfterEsc === false &&
      blocked === null,
  });
  await page.screenshot({ path: path.join(OUT, "390-list-quote-peek-esc.png") });
}

/** HIGH B — 3D/List toggle reachable in list view */
async function listViewToggleTo3D(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await openMachine(page);
  await goListBom(page);
  const tab3d = page.locator("[data-machine-view-tabs] button").filter({ hasText: "3D" });
  const tabBox = await box(tab3d);
  let switched = false;
  if (tabBox) {
    await page.touchscreen.tap(tabBox.x + tabBox.width / 2, tabBox.y + tabBox.height / 2);
    await page.waitForTimeout(450);
    switched =
      (await tab3d.getAttribute("aria-selected").catch(() => null)) === "true";
  }
  measures.push({
    item: "B-list-toggle-3d",
    tag: "webkit-390",
    switched,
    pass: switched,
  });
  await page.screenshot({ path: path.join(OUT, "390-list-toggle-3d.png") });
}

/** HIGH C — sub-part row tap in expanded peek */
async function expandedPeekSubPartTap(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await openMachine(page);
  await goListBom(page);
  await expandMotorTree(page);
  await openMotorCompactPeek(page);
  const summary = page.locator("[data-part-sheet-compact-summary]");
  const summaryBox = await box(summary);
  if (summaryBox) {
    await page.touchscreen.tap(
      summaryBox.x + summaryBox.width * 0.5,
      summaryBox.y + summaryBox.height / 2,
    );
  }
  await page.waitForTimeout(550);
  const pinionRow = page
    .locator("[data-manual-sub-sheet] [data-manual-sub-part]")
    .filter({ hasText: /pinion/i })
    .first();
  const pinionHit = pinionRow.locator(".bom-data-row--hit").first();
  const pb = await box(pinionHit);
  if (pb) {
    await page.touchscreen.tap(pb.x + pb.width * 0.35, pb.y + pb.height / 2);
  }
  await page.waitForTimeout(500);
  const title =
    (await page.locator("[data-part-sheet-title]").textContent().catch(() => "")) ?? "";
  const pass = /pinion/i.test(title);
  measures.push({
    item: "C-subpart-peek-tap",
    tag: "webkit-390",
    title: title.trim(),
    pass,
  });
  await page.screenshot({ path: path.join(OUT, "390-expanded-peek-subpart-tap.png") });
}

/** MED D — Quote tray opens in 3D after reload (WebKit) */
async function quoteOpenAfterReload3D(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await openMachine(page);
  await goListBom(page);
  const addRows = page.locator("[data-parts-bom] button.bom-add-col");
  for (let i = 0; i < 2; i += 1) {
    const row = addRows.nth(i);
    if (await row.isVisible().catch(() => false)) {
      await row.click();
      await page.waitForTimeout(250);
    }
  }
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await goModel3D(page);
  const quoteBtn = page.locator("[data-viewer-chrome-toolbar] button[data-quote-tray]").first();
  const qb = await box(quoteBtn);
  let opened = false;
  if (qb) {
    await page.touchscreen.tap(qb.x + qb.width / 2, qb.y + qb.height / 2);
    await page.waitForTimeout(600);
    opened = await page.locator(".quote-sheet.is-peek, .quote-sheet.is-full").isVisible().catch(() => false);
  }
  measures.push({
    item: "D-quote-after-reload",
    tag: "webkit-390",
    opened,
    pass: opened,
  });
  await page.screenshot({ path: path.join(OUT, "390-3d-quote-after-reload.png") });
}

/** LOW E — list toggle must not cover middle sub-part Add */
async function listToggleAddOverlap(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await openMachine(page);
  await goListBom(page);
  await expandMotorTree(page);
  const overlap = await page.evaluate(() => {
    const toggle = document.querySelector("[data-machine-view-tabs]");
    const addBtn = [...document.querySelectorAll("[data-manual-sub-part] .bom-add-col")].find(
      (el) => el.tagName === "BUTTON",
    );
    if (!toggle || !addBtn) {
      return { overlap: true, reason: "missing" };
    }
    const t = toggle.getBoundingClientRect();
    const a = addBtn.getBoundingClientRect();
    const intersects =
      t.left < a.right && t.right > a.left && t.top < a.bottom && t.bottom > a.top;
    return { overlap: intersects, toggle: t, add: a };
  });
  measures.push({
    item: "E-toggle-add-overlap",
    tag: "webkit-390",
    ...overlap,
    pass: overlap.overlap === false,
  });
  await page.screenshot({ path: path.join(OUT, "390-list-toggle-add-overlap.png") });
}

async function motorRegressionChromium(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await openMachine(page);
  await goModel3D(page);
  await page
    .waitForResponse(
      (res) => res.url().includes("/hardware-fixture/file") && res.ok(),
      { timeout: 45_000 },
    )
    .catch(() => null);
  await page.waitForFunction(
    () => {
      const c = document.querySelector("[data-machine-viewer-layout] canvas");
      return c instanceof HTMLCanvasElement && c.width > 64;
    },
    { timeout: 20_000 },
  );
  await page.waitForTimeout(800);
  return motorTapBattery(page, "390-3d-chromium");
}

async function main() {
  const machineCreds = machineLoginCreds();
  const browser = await webkit.launch({ headless: true });
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();

  try {
    await login(page, machineCreds);
    await listAfter3DClose(page);
    await listQuoteAndPeekTappable(page);
    await listViewToggleTo3D(page);
    await expandedPeekSubPartTap(page);
    await quoteOpenAfterReload3D(page);
    await listToggleAddOverlap(page);
    await peekSummaryTouch(page);
    await canvasBoxListSelect(page);
    await listRowsAtViewports(page);
    await compactPeekMotorVisible(page);
    await backToExpandedParent(page);
    await keyboardBomNav(page);
    await passiveListenerWarnings(page);
  } finally {
    await browser.close();
  }

  const chromiumBrowser = await chromium.launch({ headless: true });
  const chromiumContext = await chromiumBrowser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const chromiumPage = await chromiumContext.newPage();
  try {
    await login(chromiumPage, machineCreds);
    const passCount = await motorRegressionChromium(chromiumPage);
    measures.push({ item: "motor-tap-total", tag: "390", motorTapPassCount: passCount });
  } finally {
    fs.writeFileSync(path.join(OUT, "measures.json"), JSON.stringify(measures, null, 2));
    await chromiumBrowser.close();
  }
  const motorTapTotal = measures
    .filter((m) => m.item === "motor-tap")
    .reduce((sum, m) => sum + (m.pass ?? 0), 0);
  console.log(JSON.stringify({ out: OUT, base: BASE, motorTapTotal, measures }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
