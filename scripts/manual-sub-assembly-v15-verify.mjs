/**
 * v15 checklist: camera stability @390, list row heights, quote @1024 empty, motor taps.
 * Usage: OEE360_BASE_URL=https://spares-git-…vercel.app node scripts/manual-sub-assembly-v15-verify.mjs
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
  process.env.V15_MEDIA_OUT ??
  "/cursor/stores/bc-7479d24f-d92e-51f0-ab53-0ec629d66015/media/manual-sub-assembly-refine-v15";
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
    await page.waitForTimeout(350);
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
  return t.includes("motor") && !t.includes("pinion");
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

async function canvasSampleHash(page) {
  const canvas = page.locator("[data-machine-viewer-layout] canvas").first();
  if (!(await canvas.isVisible().catch(() => false))) {
    return null;
  }
  const data = await canvas.evaluate((el) => {
    const c = el instanceof HTMLCanvasElement ? el : null;
    if (!c || c.width < 8 || c.height < 8) {
      return null;
    }
    const ctx = c.getContext("2d");
    if (!ctx) {
      return null;
    }
    const w = Math.min(64, c.width);
    const h = Math.min(64, c.height);
    const img = ctx.getImageData(0, 0, w, h).data;
    let sum = 0;
    for (let i = 0; i < img.length; i += 4) {
      sum += img[i] + img[i + 1] + img[i + 2];
    }
    return { w, h, sum, canvasW: c.width, canvasH: c.height };
  });
  return data;
}

async function measureListChildRows(page, tag) {
  const root = page.locator("[data-staff-parts], [data-parts-bom]").first();
  const parentRow = root.locator("li.bom-tree-parent-li").filter({ hasText: /motor/i });
  const parentH = (await box(parentRow.locator(".bom-data-row--grid").first()))?.height ?? null;
  const rows = root.locator("[data-manual-sub-part] .bom-data-row--grid");
  const heights = [];
  const count = await rows.count();
  for (let i = 0; i < count; i += 1) {
    const h = (await box(rows.nth(i)))?.height;
    if (h != null) {
      heights.push(h);
    }
  }
  measures.push({
    item: "list-row-heights",
    tag,
    parentRowHeight: parentH,
    childRowHeights: heights,
    uniform64:
      heights.length > 0 && heights.every((h) => h >= 63.5 && h <= 64.5),
  });
  return { parentH, heights };
}

async function customer390CameraAndSheet(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await openMachine(page);
  await goModel3D(page);
  await dismissPartSheet(page);
  await page.waitForTimeout(500);

  const beforeHash = await canvasSampleHash(page);
  const viewerBottomInset = await page
    .locator("[data-machine-viewer-layout]")
    .getAttribute("data-viewer-bottom-inset");
  await page.screenshot({ path: path.join(OUT, "390-camera-before-select.png"), fullPage: false });

  await page.mouse.click(270, 515);
  await page.waitForTimeout(800);
  const afterMotorHash = await canvasSampleHash(page);
  const title = (await page.locator("[data-part-sheet-title]").textContent().catch(() => "")) ?? "";
  const chipBox = await box(page.locator("[data-part-sheet] .part-sheet-chip"));
  await page.screenshot({ path: path.join(OUT, "390-camera-after-motor-select.png") });
  measures.push({
    item: 1,
    tag: "390",
    title: title.trim(),
    chipBox,
    viewerBottomInset: viewerBottomInset ? Number(viewerBottomInset) : 0,
    canvasBefore: beforeHash,
    canvasAfterMotor: afterMotorHash,
    cameraSampleStable:
      beforeHash &&
      afterMotorHash &&
      beforeHash.canvasW === afterMotorHash.canvasW &&
      beforeHash.canvasH === afterMotorHash.canvasH &&
      Math.abs(beforeHash.sum - afterMotorHash.sum) < beforeHash.sum * 0.02,
  });

  const more = page.getByRole("button", { name: "More" });
  if (await more.isVisible().catch(() => false)) {
    await more.click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, "390-camera-after-more.png") });
  }

  const pinionRow = page
    .locator("[data-manual-sub-sheet] [data-manual-sub-part]")
    .filter({ hasText: /pinion/i })
    .first();
  if (await pinionRow.isVisible().catch(() => false)) {
    await pinionRow.click();
    await page.waitForTimeout(400);
    const afterPinionHash = await canvasSampleHash(page);
    const back = page.locator("[data-part-sheet-back-motor]");
    const backText = (await back.textContent())?.trim() ?? "";
    measures.push({
      item: 5,
      tag: "390",
      canvasAfterPinion: afterPinionHash,
      backText,
      backUsesDisplayName: /Miniature DC motor/i.test(backText),
    });
    await page.screenshot({ path: path.join(OUT, "390-camera-after-pinion.png") });
  }

  const sheetRowHeights = [];
  const sheetRows = page.locator(
    "[data-manual-sub-sheet] [data-manual-sub-part] .bom-data-row--grid",
  );
  const sheetCount = await sheetRows.count();
  for (let i = 0; i < sheetCount; i += 1) {
    const h = (await box(sheetRows.nth(i)))?.height;
    if (h != null) {
      sheetRowHeights.push(h);
    }
  }
  measures.push({
    item: "sheet-row-heights",
    tag: "390",
    childRowHeights: sheetRowHeights,
    uniform64:
      sheetRowHeights.length > 0 &&
      sheetRowHeights.every((h) => h >= 63.5 && h <= 64.5),
  });

  const passCount = await motorTapBattery(page, "390-customer");
  measures.push({ item: "motor-tap-total", tag: "390", motorTapPassCount: passCount });
}

async function customer1024EmptyQuote(page) {
  await page.setViewportSize({ width: 1024, height: 900 });
  const machinePath = previewHost ? "/machines/palletizer" : MACHINE;
  await page.goto(`${BASE}${machinePath}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await goModel3D(page);
  await dismissPartSheet(page);

  const quoteBtn = page
    .locator("[data-viewer-chrome-toolbar] button[data-quote-tray]")
    .first();
  if (!(await quoteBtn.isVisible({ timeout: 12_000 }).catch(() => false))) {
    measures.push({
      item: 4,
      tag: "1024",
      quoteOpens: false,
      note: "Quote chip not visible (staff preview or no customer session)",
    });
    return;
  }
  await quoteBtn.click();
  await page.waitForTimeout(650);

  const sheet = page.locator(".machine-viewer .quote-sheet").first();
  const sheetBox = await box(sheet);
  const cls = (await sheet.getAttribute("class")) ?? "";
  const emptyCopy = await page
    .locator(".quote-sheet [data-quote-target='count']")
    .textContent()
    .catch(() => "");
  measures.push({
    item: 4,
    tag: "1024",
    isOut: cls.includes("is-out"),
    sheetY: sheetBox?.y ?? null,
    quoteOpens: Boolean(sheetBox && sheetBox.y < 850 && !cls.includes("is-out")),
    emptyStateVisible: (emptyCopy ?? "").includes("Add a part"),
  });
  await page.screenshot({ path: path.join(OUT, "10-1024-quote-empty-open.png") });
}

async function listRowsAtViewports(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await openMachine(page);
  await goListBom(page);
  await expandMotorTree(page);
  await measureListChildRows(page, "390-list");

  await page.setViewportSize({ width: 1440, height: 900 });
  await openMachine(page);
  await goListBom(page);
  await expandMotorTree(page);
  await measureListChildRows(page, "1440-list");
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    const machineCreds = machineLoginCreds();
    await login(page, machineCreds);
    await customer390CameraAndSheet(page);
    await listRowsAtViewports(page);
    await context.clearCookies();
    await login(page, customer);
    await customer1024EmptyQuote(page);
  } finally {
    fs.writeFileSync(path.join(OUT, "measures.json"), JSON.stringify(measures, null, 2));
    await browser.close();
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
