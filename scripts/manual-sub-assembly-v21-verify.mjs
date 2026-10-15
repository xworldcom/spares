/**
 * v21 — STAFF-only BOM keyboard @ pointer:none (StaffPartsReview / data-staff-parts).
 * Usage: OEE360_BASE_URL=http://localhost:3010 node scripts/manual-sub-assembly-v21-verify.mjs
 */
import { createRequire } from "node:module";
const require = createRequire(
  new URL("../.cursor/skills/verify-oee360/scripts/package.json", import.meta.url),
);
const { chromium } = require("playwright");
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.OEE360_BASE_URL ?? "http://localhost:3010";
const OUT =
  process.env.V21_MEDIA_OUT ??
  "/cursor/stores/bc-7479d24f-d92e-51f0-ab53-0ec629d66015/media/manual-sub-assembly-refine-v21";
const MACHINE = "/machines/hardware-fixture";

const staffLocal = { email: "staff@spares.local", password: "SparesStaff1!" };
const staffDemo = { email: "staff@demo.com", password: "demo123456" };

fs.mkdirSync(OUT, { recursive: true });

const measures = [];

function staffCreds() {
  if (process.env.OEE360_STAFF_EMAIL && process.env.OEE360_STAFF_PASSWORD) {
    return {
      email: process.env.OEE360_STAFF_EMAIL,
      password: process.env.OEE360_STAFF_PASSWORD,
    };
  }
  return BASE.includes("vercel.app") ? staffDemo : staffLocal;
}

async function login(page, creds) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(creds),
  });
  if (!res.ok) {
    throw new Error(`login failed ${res.status} ${creds.email}`);
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

async function openMachine(page) {
  await page.goto(`${BASE}${MACHINE}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await page
    .locator("[data-machine-view-tabs], [data-staff-parts], [data-machine-viewer-layout]")
    .first()
    .waitFor({ state: "attached", timeout: 25_000 });
  await goListBom(page);
  await staffBomRoot(page).waitFor({ state: "visible", timeout: 20_000 });
}

function staffBomRoot(page) {
  return page.locator("[data-staff-parts]").first();
}

async function focusableRowMeta(page) {
  return page.evaluate(() => {
    const root = document.querySelector("[data-staff-parts]");
    if (!root) {
      return { parentTabStops: 0, childTabStops: 0, rows: [] };
    }
    const parents = root.querySelectorAll('li.bom-tree-parent-li[tabindex="0"]');
    const children = root.querySelectorAll(
      '[data-manual-sub-part] .bom-data-row--hit[tabindex="0"]',
    );
    const rows = [
      ...root.querySelectorAll(
        'li.bom-tree-parent-li[tabindex="0"], [data-manual-sub-part] .bom-data-row--hit[tabindex="0"]',
      ),
    ].map((el) => ({
      tag: el.tagName,
      kind: el.classList.contains("bom-tree-parent-li") ? "parent" : "child",
      text: (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 48),
    }));
    return {
      parentTabStops: parents.length,
      childTabStops: children.length,
      rows,
    };
  });
}

async function activeFocusKind(page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (el instanceof HTMLLIElement && el.classList.contains("bom-tree-parent-li")) {
      return "parent-li";
    }
    if (el?.classList?.contains("bom-data-row--hit")) {
      return "bom-row";
    }
    return el?.tagName ?? "none";
  });
}

async function motorTreeExpanded(page) {
  return page.evaluate(() => {
    const li = [...document.querySelectorAll("li.bom-tree-parent-li")].find((row) =>
      /miniature dc motor/i.test(row.textContent ?? ""),
    );
    const btn = li?.querySelector("button.bom-tree-chevron[aria-expanded]");
    return btn?.getAttribute("aria-expanded") === "true";
  });
}

async function staffKeyboardAtViewport(page, tag) {
  await page.emulateMedia({ media: "screen", pointer: "none" });
  await openMachine(page);
  const staffRootVisible = await staffBomRoot(page).isVisible().catch(() => false);
  const metaBefore = await focusableRowMeta(page);

  const focusPath = [];
  const firstParent = page.locator("[data-staff-parts] li.bom-tree-parent-li[tabindex='0']").first();
  await firstParent.focus();
  focusPath.push(await activeFocusKind(page));
  await page.screenshot({ path: path.join(OUT, `${tag}-focus-first-parent.png`) });

  await page.keyboard.press("Tab");
  await page.waitForTimeout(120);
  focusPath.push(`tab:${await activeFocusKind(page)}`);
  await page.screenshot({ path: path.join(OUT, `${tag}-tab-after-first-parent.png`) });

  await firstParent.focus();
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(150);
  const afterDown = await activeFocusKind(page);
  focusPath.push(`down:${afterDown}`);
  await page.screenshot({ path: path.join(OUT, `${tag}-arrow-down.png`) });

  await page.keyboard.press("End");
  await page.waitForTimeout(150);
  const afterEnd = await activeFocusKind(page);
  focusPath.push(`end:${afterEnd}`);

  await page.keyboard.press("Home");
  await page.waitForTimeout(150);
  const afterHome = await activeFocusKind(page);
  focusPath.push(`home:${afterHome}`);
  await page.screenshot({ path: path.join(OUT, `${tag}-home-first-row.png`) });

  if (await motorTreeExpanded(page)) {
    await page
      .locator("li.bom-tree-parent-li")
      .filter({ hasText: /miniature dc motor/i })
      .locator("button.bom-tree-chevron")
      .click({ force: true });
    await page.waitForTimeout(200);
  }

  const motorParent = page
    .locator("[data-staff-parts] li.bom-tree-parent-li[tabindex='0']")
    .filter({ hasText: /miniature dc motor/i })
    .first();
  await motorParent.focus();
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(250);
  const expanded = await motorTreeExpanded(page);
  await page.screenshot({ path: path.join(OUT, `${tag}-motor-expanded.png`) });

  const childRow = page
    .locator("[data-staff-parts] [data-manual-sub-part] .bom-data-row--hit[tabindex='0']")
    .first();
  await childRow.focus();
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(200);
  const leftToParent =
    (await activeFocusKind(page)) === "parent-li" &&
    (await page.evaluate(() =>
      /miniature dc motor/i.test(document.activeElement?.textContent ?? ""),
    ));

  await motorParent.focus();
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(200);
  const collapsed = !(await motorTreeExpanded(page));

  const metaExpanded = await focusableRowMeta(page);

  const pass =
    staffRootVisible &&
    metaBefore.parentTabStops > 0 &&
    (afterDown === "parent-li" || afterDown === "bom-row") &&
    afterHome === "parent-li" &&
    (afterEnd === "parent-li" || afterEnd === "bom-row") &&
    expanded &&
    collapsed &&
    leftToParent;

  measures.push({
    item: "MED-staff-keyboard",
    tag,
    staffRootVisible,
    parentTabStops: metaBefore.parentTabStops,
    childTabStopsCollapsed: metaBefore.childTabStops,
    childTabStopsExpanded: metaExpanded.childTabStops,
    focusPath,
    arrowDownFocus: afterDown,
    homeFirst: afterHome,
    endLast: afterEnd,
    arrowRightExpands: expanded,
    arrowLeftCollapses: collapsed,
    arrowLeftChildToParent: leftToParent,
    pass,
  });

  await page.screenshot({ path: path.join(OUT, `${tag}-keyboard-summary.png`) });
  return pass;
}

async function main() {
  const creds = staffCreds();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await login(page, creds);
    await page.setViewportSize({ width: 390, height: 844 });
    const pass390 = await staffKeyboardAtViewport(page, "390-pointer-none");

    await page.setViewportSize({ width: 1440, height: 900 });
    const pass1440 = await staffKeyboardAtViewport(page, "1440-pointer-none");

    measures.push({
      item: "v21-staff-keyboard-all",
      email: creds.email,
      pass: pass390 && pass1440,
    });
  } finally {
    await browser.close();
  }

  fs.writeFileSync(path.join(OUT, "measures.json"), JSON.stringify(measures, null, 2));
  const fail = measures.filter((m) => m.pass === false);
  console.log(JSON.stringify({ out: OUT, base: BASE, failCount: fail.length, measures }, null, 2));
  if (fail.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
