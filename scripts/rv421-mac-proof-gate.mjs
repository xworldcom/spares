#!/usr/bin/env node
/**
 * rv421 / rv428 / rv430 Mac proof gate (v16c) — prod-identical disposable store + Bea/Sam flows.
 * WebKit FS: bea-phone-3d-fs / bea-fs-strip-15px always enter FS; PASS requires native
 * or overlay fallback (mode= recorded in RESULTS detail — never skip FS on WebKit).
 *
 * Prereq:
 *   node scripts/rv421-mac-proof-seed.mjs
 *   npm run build && RV421_PROOF_DATA_DIR=... ./scripts/rv421-mac-proof-server.sh
 *
 *   node scripts/rv421-mac-proof-gate.mjs
 *
 * Env:
 *   RV421_GATE_BASE      default http://127.0.0.1:3019
 *   RV421_GATE_OUT       default media/rv421-proof under project store
 *   RV421_GATE_BROWSERS  comma list: chrome,webkit (default both)
 *   RV421_GATE_VIEWPORTS comma list: 390,1440 (default both)
 *   RV421_BATCH_BUNDLE   optional path to project-store bundle for list-heads in RESULTS
 */
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";

const GATE_HARNESS_VERSION = "v16d";

const VIEWER_ORBIT_EPSILON = 0.42;

/** True peek chrome (~5.75rem); reply detent is taller and must not count as peek band. */
const PEEK_BAND_MAX_H = 96;
const CLOSE_GROW_TOLERANCE_PX = 8;

const require = createRequire(import.meta.url);
function loadPlaywright() {
  try {
    return require("playwright");
  } catch {
    return require(join(process.cwd(), "node_modules/playwright"));
  }
}
const { chromium, webkit } = loadPlaywright();

const BASE = process.env.RV421_GATE_BASE || "http://127.0.0.1:3019";
const OUT = resolve(
  process.env.RV421_GATE_OUT ||
    "/cursor/stores/bc-7479d24f-d92e-51f0-ab53-0ec629d66015/media/rv421-proof",
);
const STAFF = {
  email: process.env.RV421_STAFF_EMAIL || "staff@spares.local",
  password: process.env.RV421_STAFF_PASSWORD || "SparesStaff1!",
};
const CUSTOMER = {
  email: process.env.RV421_CUSTOMER_EMAIL || "user@demo.com",
  password: process.env.RV421_CUSTOMER_PASSWORD || "demo123456",
};

const browsers = (process.env.RV421_GATE_BROWSERS || "chrome,webkit")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const viewports = (process.env.RV421_GATE_VIEWPORTS || "390,1440")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => n > 0);

const runs = [];

function macCheckoutHead() {
  try {
    return execSync("git rev-parse HEAD", {
      encoding: "utf8",
      cwd: process.cwd(),
    }).trim();
  } catch {
    return "unknown";
  }
}

function gitBundleListHeads(bundlePath) {
  if (!bundlePath || !existsSync(bundlePath)) {
    return { path: bundlePath ?? null, listHeads: "n/a" };
  }
  try {
    const listHeads = execSync(`git bundle list-heads ${JSON.stringify(bundlePath)}`, {
      encoding: "utf8",
    }).trim();
    return { path: bundlePath, listHeads: listHeads || "n/a" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { path: bundlePath, listHeads: `error: ${message}` };
  }
}

function collectRunProvenance() {
  const checkout = macCheckoutHead();
  const homeRv421BatchBundle = gitBundleListHeads(join(homedir(), "rv421-batch.bundle"));
  const envBundle = process.env.RV421_BATCH_BUNDLE?.trim();
  const projectStoreBundle = envBundle ? gitBundleListHeads(envBundle) : null;
  return {
    macCheckoutHead: checkout,
    macCheckoutShortSha: checkout.startsWith("unknown") ? "unknown" : checkout.slice(0, 7),
    harnessVersion: GATE_HARNESS_VERSION,
    homeRv421BatchBundle,
    projectStoreBundle,
  };
}

function provenanceMarkdown(provenance) {
  const lines = [
    `**Mac checkout HEAD:** \`${provenance.macCheckoutHead}\``,
    `**~/rv421-batch.bundle list-heads:**`,
    "```",
    provenance.homeRv421BatchBundle.listHeads,
    "```",
  ];
  if (provenance.projectStoreBundle) {
    lines.push(
      `**RV421_BATCH_BUNDLE (\`${provenance.projectStoreBundle.path}\`) list-heads:**`,
      "```",
      provenance.projectStoreBundle.listHeads,
      "```",
    );
  }
  return lines;
}

function viewportSize(width) {
  return width >= 1024
    ? { width: 1440, height: 900 }
    : { width: 390, height: 844 };
}

async function apiLogin(context, creds) {
  const res = await context.request.post(`${BASE}/api/auth/login`, { data: creds });
  if (!res.ok()) {
    throw new Error(`login failed ${res.status()} ${await res.text()}`);
  }
}

async function shot(page, folder, name) {
  const dir = join(OUT, folder);
  await mkdir(dir, { recursive: true });
  const path = join(dir, name);
  await page.screenshot({ path, fullPage: true });
  return path;
}

function record(row, folder, browser, viewport, pass, detail, shots = []) {
  runs.push({ row, folder, browser, viewport, pass, detail, shots });
  console.log(pass ? "PASS" : "FAIL", row, browser, viewport, detail);
}

/** Run one gate row; record ABORT/FAIL and continue the matrix on throw. */
async function safeStep(row, folder, browserName, viewport, fn) {
  try {
    await fn();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const kind = /timeout|timed out/i.test(msg) ? "ABORT" : "FAIL";
    record(row, folder, browserName, viewport, false, `${kind}: ${msg.replace(/\s+/g, " ").slice(0, 320)}`);
  }
}

const PIVOT_ROW_ORDER = [
  "sam-qty-decimal-15",
  "sam-qty-invalid-refocus",
  "sam-more-machines-onetap",
  "sam-messages-close-scroll",
  "sam-care-sort-stable",
  "sam-care-header-stable",
  "sam-ticket-search-t9",
  "bea-inline-messages-no-handle",
  "7-desktop-q26",
  "7",
  "sam-close-q26",
  "sam-close-q29",
  "sam-close-ticket9",
  "2",
  "sam-qty-minus3",
  "3",
  "sam-search-clear",
  "5",
  "1",
  "4",
  "6",
  "8",
  "10",
  "bea-h1-care-sheet",
  "bea-m9-phone-390",
  "bea-phone-3d-fs",
  "bea-3d-part-camera-stable",
  "bea-parts-panel-close-chrome",
  "9",
];

function pivotCellForRun(run) {
  if (!run) {
    return "—";
  }
  if (run.pass) {
    return "PASS";
  }
  if (typeof run.detail === "string" && run.detail.startsWith("ABORT:")) {
    return "ABORT";
  }
  return "FAIL";
}

function buildPivotMarkdown(provenance, gateStatus, generatedAt) {
  const lookup = new Map();
  for (const r of runs) {
    lookup.set(`${r.row}|${r.browser}|${r.viewport}`, r);
  }
  const colKeys = [];
  for (const b of browsers) {
    for (const vp of viewports) {
      colKeys.push({ browser: b === "chrome" ? "chrome" : b, vp, label: `${b}@${vp}` });
    }
  }
  const lines = [
    `# rv430 Mac proof pivot (${GATE_HARNESS_VERSION})`,
    "",
    ...provenanceMarkdown(provenance),
    "",
    `**Gate:** **${gateStatus}**`,
    `**Generated:** ${generatedAt}`,
    "",
    "| Row | " + colKeys.map((c) => c.label).join(" | ") + " |",
    "|-----|" + colKeys.map(() => "--------").join("|") + "|",
  ];
  const rowIds = [...new Set([...PIVOT_ROW_ORDER, ...runs.map((r) => r.row)])];
  for (const rowId of rowIds) {
    const cells = colKeys.map(({ browser, vp }) =>
      pivotCellForRun(lookup.get(`${rowId}|${browser}|${vp}`)),
    );
    lines.push(`| ${rowId} | ${cells.join(" | ")} |`);
  }
  lines.push("", "Detail table: see `RESULTS.md` in this folder.");
  return lines.join("\n");
}

async function flushGateResults(exitCode = 1) {
  await mkdir(OUT, { recursive: true });
  const provenance = collectRunProvenance();
  const gateStatus = runs.length > 0 && runs.every((r) => r.pass) ? "PASS" : "FAIL";
  const generatedAt = new Date().toISOString();
  const summary = {
    macCheckoutHead: provenance.macCheckoutHead,
    homeRv421BatchBundle: provenance.homeRv421BatchBundle,
    projectStoreBundle: provenance.projectStoreBundle,
    harnessVersion: provenance.harnessVersion,
    gateStatus,
    runs,
    generatedAt,
  };
  await writeFile(join(OUT, "proof-summary.json"), JSON.stringify(summary, null, 2));

  const lines = [
    "# rv421 Mac proof gate — RESULTS",
    "",
    ...provenanceMarkdown(provenance),
    "",
    `**Gate:** **${gateStatus}**`,
    `**Harness:** \`scripts/rv421-mac-proof-gate.mjs\` (${GATE_HARNESS_VERSION})`,
    `**Generated:** ${generatedAt}`,
    "",
    "| Row | Result | RCA / notes | Proof folder |",
    "|-----|--------|-------------|--------------|",
  ];
  const seen = new Set();
  for (const r of runs) {
    const key = `${r.row}-${r.browser}-${r.viewport}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const result = r.pass ? "PASS" : r.detail?.startsWith("ABORT:") ? "ABORT" : "FAIL";
    lines.push(
      `| ${r.row} | **${result}** | ${String(r.detail).replace(/\|/g, "/")} | [${r.folder}/](./${r.folder}/) |`,
    );
  }
  lines.push("", "Raw log: `proof-summary.json` in this folder.");
  const resultsBody = lines.join("\n");
  const pivotBody = buildPivotMarkdown(provenance, gateStatus, generatedAt);
  await writeFile(join(OUT, "RESULTS.md"), resultsBody);
  const pivotName = `RESULTS-rv430-${GATE_HARNESS_VERSION}-${provenance.macCheckoutShortSha}.md`;
  await writeFile(join(OUT, pivotName), pivotBody);
  console.log(JSON.stringify({ gateStatus, rows: runs.length, pivot: pivotName }, null, 2));
  process.exit(exitCode);
}

async function sortSelectOffsetInFilterRow(page) {
  return page.locator(".tickets-workspace-sort-select").evaluate((el) => {
    const row = el.closest(".tickets-workspace-filter-row");
    if (!row) {
      return null;
    }
    const selectRect = el.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    return {
      x: selectRect.left - rowRect.left,
      y: selectRect.top - rowRect.top,
    };
  });
}

async function openQuoteMessages(page, quoteRef) {
  await page.goto(`${BASE}/staff/quotes/${quoteRef}`, { waitUntil: "domcontentloaded" });
  const inline = page.locator(".conversation-sheet.is-inline");
  await inline.waitFor({ state: "visible", timeout: 20_000 }).catch(() => {});
  if (await inline.isVisible().catch(() => false)) {
    return;
  }
  const handle = page.locator(".snap-sheet-handle").first();
  if (await handle.isVisible().catch(() => false)) {
    await handle.click({ timeout: 20_000 });
  } else {
    await page.getByRole("button", { name: /messages/i }).first().click({ timeout: 20_000 });
  }
  await page.locator(".snap-sheet-handle, .conversation-sheet.is-inline").first().waitFor({
    timeout: 15_000,
  });
}

async function tenantIdForContext(context) {
  const res = await context.request.get(`${BASE}/api/auth/me`);
  if (!res.ok()) {
    return "tenant-oee360-host";
  }
  const body = await res.json();
  return body.user?.tenantId?.trim() || "tenant-oee360-host";
}

async function seedCustomerTray(page, machineSlug, tenantId) {
  await page.evaluate(
    ({ key, line }) => {
      window.localStorage.setItem(key, JSON.stringify([line]));
    },
    {
      key: `spares-quote-tray:${tenantId}:${machineSlug}`,
      line: {
        id: "6331K32",
        name: "Mac proof tray line",
        meshName: "",
        qty: 1,
      },
    },
  );
}

async function expandConversationSheet(page) {
  const card = page.locator(".conversation-sheet").first();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const isFull = await card.evaluate((el) => el.classList.contains("is-full"));
    if (isFull) {
      return;
    }
    const isOut = await card.evaluate((el) => el.classList.contains("is-out"));
    const handle = page.locator(".snap-sheet-handle").first();
    if (isOut) {
      await handle.click({ timeout: 8000 });
    } else {
      await handle.click({ timeout: 8000 });
    }
    await page.waitForTimeout(450);
  }
}

async function conversationSheetMetrics(page) {
  const card = page.locator(".conversation-sheet").first();
  return card.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return {
      h: Math.round(rect.height),
      peek: el.classList.contains("is-peek"),
      reply: el.classList.contains("is-reply"),
      full: el.classList.contains("is-full"),
      out: el.classList.contains("is-out"),
    };
  });
}

/** Customer list overlay vs staff split aside — avoids strict-mode duplicate nested BOM lists. */
function machinePartsBomRoot(page) {
  return page.locator("section[data-parts-bom], aside.machine-bom[data-parts-bom]").first();
}

async function waitConversationSheetResting(page) {
  await page
    .waitForFunction(
      () => {
        const el = document.querySelector(".conversation-sheet");
        return (
          el &&
          !el.classList.contains("is-dragging") &&
          !el.classList.contains("is-settling") &&
          !el.hasAttribute("data-motion-live")
        );
      },
      { timeout: 8000 },
    )
    .catch(() => {});
}

async function tapOrClickClose(page, closeBtn, useTap) {
  if (useTap) {
    await closeBtn.tap({ timeout: 8000 });
  } else {
    await closeBtn.click({ timeout: 8000 });
  }
}

/** Sam live: Messages sheet resting in peek band (~60–92px) before Close. */
async function ensureMessagesPeekBand(page) {
  const card = page.locator(".conversation-sheet").first();
  await card.waitFor({ state: "visible", timeout: 15_000 });
  const handle = page.locator(".snap-sheet-handle").first();
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const m = await conversationSheetMetrics(page);
    if (m.peek && m.h <= PEEK_BAND_MAX_H && m.h > 24) {
      return { ok: true, ...m };
    }
    if (m.out) {
      await handle.click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(450);
      continue;
    }
    if (m.full) {
      await handle.click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(450);
      continue;
    }
    if ((m.reply || m.full) && m.h > PEEK_BAND_MAX_H) {
      await handle.click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(450);
      continue;
    }
    await handle.click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(450);
  }
  const m = await conversationSheetMetrics(page);
  const ok = m.peek && m.h <= PEEK_BAND_MAX_H && m.h > 24;
  return { ok, ...m };
}

/**
 * Sam live Close from peek band: must not grow (~60→140); Close stays visible; optional scroll stable.
 */
async function assertSamCloseFromPeekBand(page, row, folder, browser, vp, { scrollAfter = false } = {}) {
  const band = await ensureMessagesPeekBand(page);
  const hBefore = band.h;
  const closeBtn = page.getByRole("button", { name: /^close$/i });
  const closeBefore = await closeBtn.isVisible().catch(() => false);
  const bandOk = band.ok && band.peek && hBefore <= PEEK_BAND_MAX_H;
  const useTap = vp < 1024;
  await tapOrClickClose(page, closeBtn, useTap);
  await waitConversationSheetResting(page);
  await page.waitForTimeout(350);
  const afterClose = await conversationSheetMetrics(page);
  const hAfterClose = afterClose.h;
  const grewOnClose = hAfterClose > hBefore + CLOSE_GROW_TOLERANCE_PX;
  const closeAfterClick = await closeBtn.isVisible().catch(() => false);
  const dismissedOk = afterClose.out && hAfterClose <= hBefore + CLOSE_GROW_TOLERANCE_PX + 4;
  const peekAfterOk =
    afterClose.peek && hAfterClose <= PEEK_BAND_MAX_H && closeAfterClick && !grewOnClose;
  let hAfterScroll = hAfterClose;
  let scrollStable = true;
  if (scrollAfter) {
    await page.evaluate(() => window.scrollBy(0, 260));
    await page.waitForTimeout(450);
    hAfterScroll = (await conversationSheetMetrics(page)).h;
    const closeAfterScroll = await closeBtn.isVisible().catch(() => false);
    const afterScroll = await conversationSheetMetrics(page);
    scrollStable =
      !grewOnClose &&
      hAfterScroll <= hBefore + CLOSE_GROW_TOLERANCE_PX + 8 &&
      hAfterScroll <= Math.max(hAfterClose + 8, hAfterClose * 1.05) &&
      (closeAfterScroll || afterScroll.out);
  }
  const pass =
    bandOk &&
    closeBefore &&
    !grewOnClose &&
    (dismissedOk || peekAfterOk) &&
    (!scrollAfter || scrollStable);
  const shots = [await shot(page, folder, `${row}-${browser}-${vp}-close.png`)];
  record(
    row,
    folder,
    browser,
    vp,
    pass,
    `band=${bandOk} hBefore=${hBefore} hAfter=${hAfterClose} grew=${grewOnClose} closeAfter=${closeAfterClick} scroll=${scrollAfter ? `hScroll=${hAfterScroll} stable=${scrollStable}` : "n/a"}`,
    shots,
  );
}

async function horizontalOverflowPx(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) {
      return { found: false, overflow: 0 };
    }
    return {
      found: true,
      overflow: Math.max(0, Math.round(el.scrollWidth - el.clientWidth)),
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    };
  }, selector);
}

async function waitForDocumentTitle(page, pattern) {
  await page.waitForFunction(
    (re) => re.test(document.title),
    pattern,
    { timeout: 12_000 },
  );
  return page.title();
}

async function readViewerFsMetrics(page) {
  return page.evaluate(() => {
    const native = Boolean(
      document.fullscreenElement || document.webkitFullscreenElement,
    );
    const chrome =
      document.querySelector("[data-machine-viewer-chrome]") ||
      document.querySelector(".machine-viewer");
    const layout = document.querySelector("[data-machine-viewer-layout]");
    if (!chrome || !layout) {
      return {
        native,
        overlay: false,
        layoutH: 0,
        innerH: window.innerHeight,
        layoutTop: -1,
      };
    }
    const chromeStyle = getComputedStyle(chrome);
    const fsAttr = chrome.getAttribute("data-viewer-fs");
    const overlay =
      !native &&
      (fsAttr === "overlay" ||
        chromeStyle.position === "fixed" ||
        chrome.hasAttribute("data-viewer-fs-overlay"));
    const chromeRect = chrome.getBoundingClientRect();
    const layoutRect = layout.getBoundingClientRect();
    return {
      native,
      overlay,
      layoutH: Math.round(layoutRect.height),
      innerH: window.innerHeight,
      layoutTop: Math.round(layoutRect.top - chromeRect.top),
    };
  });
}

function viewerFsMode(metrics) {
  if (metrics.native) {
    return "native";
  }
  if (metrics.overlay) {
    return "overlay";
  }
  return "none";
}

async function controlsAboveTabBar(page, selectors) {
  return page.evaluate((sels) => {
    const tabbar = document.querySelector(".spares-tabbar");
    if (!tabbar) {
      return { ok: false, reason: "no-tabbar" };
    }
    const tabTop = tabbar.getBoundingClientRect().top;
    const hits = {};
    for (const sel of sels) {
      const el = document.querySelector(sel);
      if (!el) {
        hits[sel] = false;
        continue;
      }
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      hits[sel] =
        rect.height > 4 &&
        rect.bottom <= tabTop + 1 &&
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        style.opacity !== "0";
    }
    return { ok: Object.values(hits).every(Boolean), tabTop, hits };
  }, selectors);
}

async function sheetBottomAboveTabBar(page, sheetSelector = ".conversation-sheet, .quote-sheet") {
  return page.evaluate((sel) => {
    const sheet = document.querySelector(sel);
    const tabbar = document.querySelector(".spares-tabbar");
    if (!sheet || !tabbar) {
      return { ok: false, reason: "missing" };
    }
    const bottom = sheet.getBoundingClientRect().bottom;
    const tabTop = tabbar.getBoundingClientRect().top;
    return { ok: bottom <= tabTop + 1, bottom: Math.round(bottom), tabTop: Math.round(tabTop) };
  }, sheetSelector);
}

async function viewerChromeHiddenForFs(page) {
  return page.evaluate(() => {
    const immersive = document.documentElement.classList.contains("viewer-immersive-fs");
    const tab = document.querySelector(".spares-tabbar");
    const header = document.querySelector(".spares-header");
    if (!tab || !header) {
      return immersive;
    }
    const tabBox = tab.getBoundingClientRect();
    const headBox = header.getBoundingClientRect();
    const tabHidden =
      immersive ||
      getComputedStyle(tab).visibility === "hidden" ||
      tabBox.height < 2 ||
      tabBox.bottom < 4;
    const headHidden =
      immersive ||
      getComputedStyle(header).visibility === "hidden" ||
      headBox.height < 2 ||
      headBox.bottom < 4;
    return tabHidden && headHidden;
  });
}

async function mouseDragVertical(page, x, yStart, yEnd, steps = 16) {
  await page.mouse.move(x, yStart);
  await page.mouse.down();
  await page.mouse.move(x, yEnd, { steps });
  await page.mouse.up();
}

async function touchDragVertical(page, x, yStart, yEnd) {
  const card = page.locator(".conversation-sheet, .quote-sheet").first();
  const pointerInit = {
    pointerId: 7,
    pointerType: "touch",
    isPrimary: true,
    button: 0,
    buttons: 1,
    pressure: 0.5,
  };
  await card.dispatchEvent("pointerdown", { ...pointerInit, clientX: x, clientY: yStart });
  await card.dispatchEvent("pointermove", { ...pointerInit, clientX: x, clientY: yEnd, buttons: 1 });
  await card.dispatchEvent("pointerup", { ...pointerInit, clientX: x, clientY: yEnd, buttons: 0 });
}

async function careSheetDragStuckMetrics(page, card) {
  return card.evaluate((el) => {
    const settling = el.classList.contains("is-settling") || el.classList.contains("is-dragging");
    const motionLive = el.hasAttribute("data-motion-live");
    const h = el.getBoundingClientRect().height;
    const reply = Number.parseFloat(getComputedStyle(el).getPropertyValue("--reply-h"));
    const full = Number.parseFloat(getComputedStyle(el).getPropertyValue("--full-h"));
    const betweenDetents =
      Number.isFinite(reply) &&
      Number.isFinite(full) &&
      h > reply + 18 &&
      h < full - 18 &&
      h > reply + 0.35 * (full - reply) &&
      h < full - 0.35 * (full - reply);
    return { settling, motionLive, betweenDetents, h: Math.round(h) };
  });
}

async function evaluateCareH1AfterDrag(page, card) {
  await waitConversationSheetResting(page);
  await page.waitForTimeout(450);
  const stuck = await careSheetDragStuckMetrics(page, card);
  const sheetEdge = await sheetBottomAboveTabBar(page);
  const above = await controlsAboveTabBar(page, [
    ".conversation-sheet-close",
    ".imsg-send",
  ]);
  const closeVisible = await page
    .locator(".conversation-sheet-close")
    .isVisible()
    .catch(() => false);
  const sendVisible = await page
    .locator(".imsg-send")
    .isVisible()
    .catch(() => false);
  const detentOk = await card.evaluate((el) => {
    if (
      el.classList.contains("is-dragging") ||
      el.classList.contains("is-settling") ||
      el.hasAttribute("data-motion-live")
    ) {
      return false;
    }
    const h = el.getBoundingClientRect().height;
    const reply = Number.parseFloat(getComputedStyle(el).getPropertyValue("--reply-h"));
    const full = Number.parseFloat(getComputedStyle(el).getPropertyValue("--full-h"));
    if (el.classList.contains("is-peek")) {
      return Number.isFinite(reply) && h <= reply + 10;
    }
    if (el.classList.contains("is-reply")) {
      return Number.isFinite(reply) && Math.abs(h - reply) <= 12;
    }
    if (el.classList.contains("is-full")) {
      return Number.isFinite(full) && Math.abs(h - full) <= 16;
    }
    return false;
  });
  const pass =
    !stuck.settling &&
    !stuck.motionLive &&
    !stuck.betweenDetents &&
    detentOk &&
    sheetEdge.ok &&
    above.ok &&
    closeVisible &&
    sendVisible;
  return { pass, stuck, sheetEdge, above, closeVisible, sendVisible, detentOk };
}

async function newCustomerPhone390Context(browser, browserName) {
  const context = await browser.newContext({
    viewport: viewportSize(390),
    hasTouch: true,
  });
  if (browserName === "chrome" || browserName === "chromium") {
    try {
      await context.grantPermissions(["fullscreen"], { origin: new URL(BASE).origin });
    } catch {
      // Playwright builds without fullscreen permission still exercise requestFullscreen.
    }
  }
  await apiLogin(context, CUSTOMER);
  return context;
}

async function openCustomerQuoteTrayExpanded(page) {
  await page.locator("canvas").first().waitFor({ state: "visible", timeout: 60_000 });
  const quoteChip = page.locator("button[data-quote-tray]").first();
  await quoteChip.waitFor({ state: "visible", timeout: 20_000 });
  await quoteChip.click({ timeout: 12_000 });
  const quoteSheet = page.locator(".machine-viewer .quote-sheet, .quote-sheet").first();
  await quoteSheet.waitFor({ state: "visible", timeout: 12_000 });
  const handle = quoteSheet.locator('[data-quote-target="handle"], .quote-sheet-handle').first();
  const isFull = await quoteSheet.evaluate((el) => el.classList.contains("is-full"));
  if (!isFull) {
    await handle.click({ force: true, timeout: 10_000 });
    await page.waitForTimeout(550);
  }
  return quoteSheet;
}

async function runBeaPhone3dFs390(browserName, browser) {
  const vp = 390;
  const context = await newCustomerPhone390Context(browser, browserName);
  const page = await context.newPage();
  try {
    await page.goto(`${BASE}/machines/palletizer`, { waitUntil: "domcontentloaded" });
    await page.locator("canvas").first().waitFor({ state: "visible", timeout: 60_000 }).catch(() => {});
    await clickEnterViewerFullscreen(page);
    await page.waitForTimeout(750);
    const inFs = await readViewerFsMetrics(page);
    const mode = viewerFsMode(inFs);
    const chromeHidden = await viewerChromeHiddenForFs(page);
    const fsEntered =
      (inFs.native || inFs.overlay) &&
      chromeHidden &&
      inFs.layoutH >= Math.round(inFs.innerH * 0.86);
    record(
      "bea-phone-3d-fs",
      "bea-smoke",
      browserName,
      vp,
      fsEntered,
      `mode=${mode} layoutH=${inFs.layoutH} innerH=${inFs.innerH} chromeHidden=${chromeHidden}`,
    );
  } finally {
    await context.close();
  }
}

async function runBeaM9Phone390(browserName, browser) {
  const vp = 390;
  const context = await newCustomerPhone390Context(browser, browserName);
  const page = await context.newPage();
  try {
    const customerTenant = await tenantIdForContext(context);
    await page.goto(`${BASE}/machines/palletizer`, { waitUntil: "domcontentloaded" });
    await seedCustomerTray(page, "palletizer", customerTenant);
    await page.reload({ waitUntil: "domcontentloaded" });
    if (browserName === "webkit") {
      await page.waitForTimeout(900);
    }
    const quoteSheet = await openCustomerQuoteTrayExpanded(page);
    const hExpanded = await quoteSheet.evaluate((el) => Math.round(el.getBoundingClientRect().height));
    const removeBtn = quoteSheet.getByRole("button", { name: /^remove$/i }).first();
    await removeBtn.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
    const removeBox = await removeBtn.boundingBox();
    const vpH = page.viewportSize()?.height ?? 844;
    const removeInView =
      Boolean(removeBox) && removeBox.y >= 0 && removeBox.y + removeBox.height <= vpH + 1;
    const sheetEdgeM9 = await sheetBottomAboveTabBar(page, ".machine-viewer .quote-sheet, .quote-sheet");
    await removeBtn.click({ timeout: 8000 }).catch(() => {});
    const undoBtn = page.locator("[data-quote-undo-toast] .quote-undo-toast-action");
    await undoBtn.waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
    const undoBox = await undoBtn.boundingBox();
    const undoInView =
      Boolean(undoBox) && undoBox.y >= 0 && undoBox.y + undoBox.height <= vpH + 1;
    record(
      "bea-m9-phone-390",
      "bea-smoke",
      browserName,
      vp,
      hExpanded > 120 && removeInView && sheetEdgeM9.ok && undoInView,
      `expandedH=${hExpanded} removeInView=${removeInView} edge=${JSON.stringify(sheetEdgeM9)} undoInView=${undoInView}`,
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    record(
      "bea-m9-phone-390",
      "bea-smoke",
      browserName,
      vp,
      false,
      `FAIL: ${msg.replace(/\s+/g, " ").slice(0, 280)}`,
    );
  } finally {
    await context.close();
  }
}

async function readViewerOrbit(page) {
  return page.evaluate(() => {
    const layout = document.querySelector("[data-machine-viewer-layout]");
    const raw = layout?.getAttribute("data-viewer-orbit");
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  });
}

function viewerOrbitStable(before, after, epsilon = VIEWER_ORBIT_EPSILON) {
  if (!before || !after) {
    return false;
  }
  for (const key of ["position", "target"]) {
    const a = before[key];
    const b = after[key];
    if (!Array.isArray(a) || !Array.isArray(b) || a.length < 3 || b.length < 3) {
      return false;
    }
    for (let i = 0; i < 3; i += 1) {
      if (Math.abs(a[i] - b[i]) > epsilon) {
        return false;
      }
    }
  }
  return true;
}

async function runBeaHardwareFixtureGateRows(browserName, browser, vp) {
  const context = await browser.newContext({
    viewport: viewportSize(vp),
    hasTouch: vp < 1024,
  });
  if (browserName === "chrome" || browserName === "chromium") {
    try {
      await context.grantPermissions(["fullscreen"], { origin: new URL(BASE).origin });
    } catch {
      // optional
    }
  }
  await apiLogin(context, CUSTOMER);
  const page = await context.newPage();
  try {
    await page.goto(`${BASE}/machines/hardware-fixture`, { waitUntil: "domcontentloaded" });
    await page.locator("canvas").first().waitFor({ state: "visible", timeout: 60_000 }).catch(() => {});
    await page
      .locator("[data-machine-viewer-layout][data-viewer-canonical-ready='true']")
      .waitFor({ state: "attached", timeout: 60_000 })
      .catch(() => {});
    await page.waitForTimeout(600);

    const orbit0 = await readViewerOrbit(page);
    const canvas = page.locator("canvas").first();
    const canvasBox = await canvas.boundingBox();
    let cameraPass = false;
    let cameraDetail = "no-canvas";
    if (canvasBox && orbit0) {
      const taps = [
        { x: canvasBox.width * 0.42, y: canvasBox.height * 0.52 },
        { x: canvasBox.width * 0.58, y: canvasBox.height * 0.46 },
      ];
      let lastOrbit = orbit0;
      let stableChain = true;
      for (const pos of taps) {
        await canvas.click({ position: pos, timeout: 10_000 });
        await page.waitForTimeout(550);
        const nextOrbit = await readViewerOrbit(page);
        if (!viewerOrbitStable(lastOrbit, nextOrbit)) {
          stableChain = false;
          cameraDetail = `orbit-shift after tap @${Math.round(pos.x)},${Math.round(pos.y)}`;
          break;
        }
        lastOrbit = nextOrbit;
      }
      cameraPass = stableChain && Boolean(lastOrbit);
      if (cameraPass) {
        cameraDetail = "orbit-stable-across-2-taps";
      }
    }
    record(
      "bea-3d-part-camera-stable",
      "bea-smoke",
      browserName,
      vp,
      cameraPass,
      cameraDetail,
    );

    await page.goto(`${BASE}/machines/hardware-fixture`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /^list$/i }).click({ timeout: 10_000 });
    const bomRoot = machinePartsBomRoot(page);
    await bomRoot.waitFor({ state: "visible", timeout: 12_000 });
    const partRow = bomRoot.locator("button").first();
    await partRow.click({ timeout: 10_000 });
    const sheet = page.locator("[data-part-sheet]").first();
    await sheet.waitFor({ state: "visible", timeout: 10_000 });
    const close = page.locator("[data-part-sheet-close]").first();
    await close.waitFor({ state: "visible", timeout: 8000 });
    const sheetBox = await sheet.boundingBox();
    const closeBox = await close.boundingBox();
    const inHeader = await close.evaluate(
      (el) => el.closest("[data-part-sheet-header]") !== null,
    );
    const touchTarget =
      Boolean(closeBox) && closeBox.width >= 44 && closeBox.height >= 44;
    const headerRegion =
      Boolean(sheetBox && closeBox) && closeBox.y - sheetBox.y <= 56 && inHeader;
    record(
      "bea-parts-panel-close-chrome",
      "bea-smoke",
      browserName,
      vp,
      touchTarget && headerRegion,
      `touch=${touchTarget} header=${headerRegion} close=${closeBox ? `${Math.round(closeBox.width)}x${Math.round(closeBox.height)}` : "na"}`,
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    record(
      "bea-3d-part-camera-stable",
      "bea-smoke",
      browserName,
      vp,
      false,
      `FAIL: ${msg.replace(/\s+/g, " ").slice(0, 200)}`,
    );
    record(
      "bea-parts-panel-close-chrome",
      "bea-smoke",
      browserName,
      vp,
      false,
      `FAIL: ${msg.replace(/\s+/g, " ").slice(0, 200)}`,
    );
  } finally {
    await context.close();
  }
}

async function runCareH1DragProbe(page, actor) {
  await page.goto(`${BASE}/care/tickets/9`, { waitUntil: "domcontentloaded" });
  await expandConversationSheet(page);
  const card = page.locator(".conversation-sheet").first();
  const sheetBox = await card.boundingBox();
  if (!sheetBox) {
    return { pass: false, detail: "no-sheet-box" };
  }
  const x = sheetBox.x + sheetBox.width / 2;
  const yStart = sheetBox.y + 32;
  const yEnd = sheetBox.y + sheetBox.height * 0.52;
  if (actor === "mouse") {
    await mouseDragVertical(page, x, yStart, yEnd);
  } else {
    await touchDragVertical(page, x, yStart, yEnd);
  }
  const result = await evaluateCareH1AfterDrag(page, card);
  return {
    pass: result.pass,
    detail: `stuck=${JSON.stringify(result.stuck)} edge=${JSON.stringify(result.sheetEdge)} detent=${result.detentOk} close=${result.closeVisible} send=${result.sendVisible}`,
  };
}

async function runBeaH1CareSheet390(browserName, browser) {
  const vp = 390;
  const context = await newCustomerPhone390Context(browser, browserName);
  const page = await context.newPage();
  try {
  const mouseH1 = await runCareH1DragProbe(page, "mouse");
  const touchH1 = await runCareH1DragProbe(page, "touch");
  const h1Pass = mouseH1.pass && touchH1.pass;
  record(
    "bea-h1-care-sheet",
    "bea-smoke",
    browserName,
    vp,
    h1Pass,
    `mouse=${mouseH1.pass} ${mouseH1.detail} touch=${touchH1.pass} ${touchH1.detail}`,
  );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    record(
      "bea-h1-care-sheet",
      "bea-smoke",
      browserName,
      vp,
      false,
      `FAIL: ${msg.replace(/\s+/g, " ").slice(0, 280)}`,
    );
  } finally {
    await context.close();
  }
}

async function clickEnterViewerFullscreen(page) {
  const enterBtn = page.getByRole("button", { name: /enter full screen/i }).first();
  if (await enterBtn.isVisible().catch(() => false)) {
    await enterBtn.click({ timeout: 10_000 });
    return;
  }
  await page
    .getByRole("button", { name: /fullscreen|expand/i })
    .first()
    .click({ timeout: 10_000 });
}

async function clickExitViewerFullscreen(page) {
  const exitBtn = page.getByRole("button", { name: /exit full screen/i }).first();
  if (await exitBtn.isVisible().catch(() => false)) {
    await exitBtn.click({ timeout: 10_000 });
    await page
      .waitForFunction(
        () => !document.fullscreenElement && !document.webkitFullscreenElement,
        { timeout: 10_000 },
      )
      .catch(() => {});
  }
  await page.waitForTimeout(900);
}

async function runRows(browserName, launch) {
  const browser = await launch.launch({ headless: true });
  for (const vp of viewports) {
    const size = viewportSize(vp);
    const context = await browser.newContext({
      viewport: size,
      hasTouch: vp < 1024,
    });
    if (browserName === "chrome" || browserName === "chromium") {
      try {
        await context.grantPermissions(["fullscreen"], { origin: new URL(BASE).origin });
      } catch {
        // Playwright builds without fullscreen permission still exercise requestFullscreen.
      }
    }
    await apiLogin(context, STAFF);
    const page = await context.newPage();

    // Row 2 / sam-qty-minus3 — invalid qty keeps error, no silent commit to 1
    await safeStep("2", "money-qty", browserName, vp, async () => {
    await page.goto(`${BASE}/staff/quotes`, { waitUntil: "domcontentloaded" });
    await page.locator("ul a, ul button").first().click({ timeout: 20_000 });
    const qty = page.getByLabel("Qty").first();
    await qty.fill("-3");
    await qty.blur();
    const qtyVal = await qty.inputValue();
    const qtyErr = await page.getByRole("alert").filter({ hasText: /at least|negative/i }).isVisible();
    const qtyPass = qtyErr && qtyVal.includes("-3");
    record("2", "money-qty", browserName, vp, qtyPass, `blur=${qtyVal} qtyErr=${qtyErr}`);
    record("sam-qty-minus3", "money-qty", browserName, vp, qtyPass, `blur=${qtyVal} qtyErr=${qtyErr}`);
    });

    // Row 3 Q27 lock + copy
    await safeStep("3", "quotes", browserName, vp, async () => {
    await page.goto(`${BASE}/staff/quotes/27`, { waitUntil: "domcontentloaded" });
    const sellDisabled = await page
      .locator('[id^="sell-"]')
      .first()
      .isDisabled()
      .catch(() => false);
    await page.getByText(/locked after PO/i).first().waitFor({ state: "visible", timeout: 12_000 }).catch(() => {});
    const lockCopy = await page.getByText(/locked after PO/i).first().isVisible().catch(() => false);
    const editPricingVisible = await page
      .getByRole("button", { name: /edit pricing/i })
      .isVisible()
      .catch(() => false);
    const q27Pass = sellDisabled && lockCopy && !editPricingVisible;
    record("3", "quotes", browserName, vp, q27Pass, `sellDisabled=${sellDisabled} lockCopy=${lockCopy}`);
    record("3-q27-pricing-lock", "quotes", browserName, vp, q27Pass, `editPricing=${editPricingVisible}`);
    });

    // sam-search-clear
    await safeStep("sam-search-clear", "quotes", browserName, vp, async () => {
    await page.goto(`${BASE}/staff/quotes`, { waitUntil: "domcontentloaded" });
    const search = page.locator("#staff-quotes-search").or(page.getByLabel("Search quotes"));
    await search.first().waitFor({ state: "visible", timeout: 12_000 });
    await search.first().fill("zzqxj");
    await page.waitForTimeout(350);
    await search.first().fill("");
    await page.waitForTimeout(400);
    const url = page.url();
    const cleared = !url.includes("q=zzqxj") && (await search.first().inputValue()) === "";
    record("sam-search-clear", "quotes", browserName, vp, cleared, `cleared=${cleared}`);
    });

    // Row 5 titles
    await safeStep("5", "document-title", browserName, vp, async () => {
    await page.goto(`${BASE}/staff/quotes`, { waitUntil: "networkidle" });
    const tQuotes = await page.title();
    await page.goto(`${BASE}/staff/tickets`, { waitUntil: "networkidle" });
    const tTickets = await page.title();
    const titlePass =
      /quotes/i.test(tQuotes) &&
      /oee360/i.test(tQuotes) &&
      /(all tickets|tickets)/i.test(tTickets) &&
      /oee360/i.test(tTickets);
    record("5", "document-title", browserName, vp, titlePass, `${tQuotes}|${tTickets}`);
    });

    // Row 7 phone close @390 only; desktop quote uses inline column @1440
    await safeStep("7", "phone-sheets", browserName, vp, async () => {
    if (vp < 1024) {
      for (const [row, ref] of [
        ["sam-close-q26", "26"],
        ["sam-close-q29", "29"],
        ["sam-close-ticket9", "9"],
      ]) {
        if (row === "sam-close-ticket9") {
          await page.goto(`${BASE}/care/tickets/9`, { waitUntil: "domcontentloaded" });
        } else {
          await openQuoteMessages(page, ref);
        }
        await assertSamCloseFromPeekBand(
          page,
          row,
          row.replace("sam-close-", "sam-close-"),
          browserName,
          vp,
        );
      }
    } else {
      await openQuoteMessages(page, "26");
      const inline = await page.locator(".conversation-sheet.is-inline").isVisible();
      record("7-desktop-q26", "7-desktop-close", browserName, vp, inline, `inline=${inline}`);
      record(
        "7",
        "phone-sheets",
        browserName,
        vp,
        inline,
        inline ? "quote-inline-column" : "overlay",
      );
    }
    });

    // Row 1 / 6331k32 — obsolete lifecycle label on staff parts
    await safeStep("1", "6331k32-active", browserName, vp, async () => {
    await page.goto(`${BASE}/staff/parts`, { waitUntil: "domcontentloaded" });
    const searchParts = page.getByLabel(/search/i).first();
    if (await searchParts.isVisible().catch(() => false)) {
      await searchParts.fill("6331K32");
      await page.waitForTimeout(400);
    }
    const obsoleteLabel = await page
      .getByText(/obsolete|discontinued|successor/i)
      .first()
      .isVisible()
      .catch(() => false);
    record("1", "6331k32-active", browserName, vp, obsoleteLabel, `obsolete=${obsoleteLabel}`);
    record("6331k32-lifecycle", "6331k32-active", browserName, vp, obsoleteLabel, `obsolete=${obsoleteLabel}`);
    });

    // Row 4 offline — staff ticket status shows error when network fails
    if (vp < 1024) {
    await safeStep("4", "offline", browserName, vp, async () => {
      await context.route("**/api/tickets/**", (route) => {
        if (route.request().method() === "PATCH") {
          return route.abort("failed");
        }
        return route.continue();
      });
      await page.goto(`${BASE}/care/tickets/9`, { waitUntil: "domcontentloaded" });
      await page
        .locator("[data-care-ticket-detail] .quote-progress-track")
        .waitFor({ state: "visible", timeout: 20_000 })
        .catch(() => {});
      const changeBtn = page
        .locator('button.quote-progress-step:not([aria-current="step"])')
        .first();
      if (await changeBtn.isVisible().catch(() => false)) {
        await changeBtn.scrollIntoViewIfNeeded();
        await changeBtn.click();
      }
      const offlineAlert = page.getByRole("alert").filter({
        hasText: /offline|network|could not reach|try again/i,
      });
      await offlineAlert.first().waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
      const offlineCopy = await offlineAlert.first().isVisible().catch(() => false);
      record("4", "offline", browserName, vp, offlineCopy, `offlineCopy=${offlineCopy}`);
      await context.unroute("**/api/tickets/**");
    });
    }

    // Row 6 — Recently updated sort surfaces ticket 9 before 34
    if (vp >= 1024) {
    await safeStep("6", "care-recent-sort", browserName, vp, async () => {
      await page.goto(`${BASE}/care/tickets?sort=updated`, { waitUntil: "domcontentloaded" });
      const items = await page.locator(".tickets-workspace-list a, .tickets-workspace-list button").allInnerTexts();
      const joined = items.join("\n");
      const i9 = joined.search(/\b9\b|Ticket\s*9/i);
      const i34 = joined.search(/\b34\b|Ticket\s*34/i);
      const orderOk = i9 >= 0 && (i34 < 0 || i9 < i34);
      record("6", "care-recent-sort", browserName, vp, orderOk, `i9=${i9} i34=${i34}`);
    });
    }

    // Row 8 view part
    await safeStep("8", "machines-m", browserName, vp, async () => {
    await page.goto(`${BASE}/machines/hardware-fixture`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    const viewPart = await page
      .locator("[data-machine-lifecycle-links] a, a[href*='part-lifecycle']")
      .first()
      .isVisible()
      .catch(() => false);
    record("8", "machines-m", browserName, vp, viewPart, `viewPart=${viewPart}`);
    record("bea-m5-view-part", "bea-smoke", browserName, vp, viewPart, `viewPart=${viewPart}`);
    });

    // Row 10 — palletizer viewer loads; no duplicate account email line
    if (vp >= 1024) {
    await safeStep("10", "also", browserName, vp, async () => {
      await page.goto(`${BASE}/machines/palletizer`, { waitUntil: "domcontentloaded" });
      await page.locator("canvas").first().waitFor({ state: "visible", timeout: 60_000 }).catch(() => {});
      const viewerH = await page
        .locator("[data-machine-viewer-layout]")
        .evaluate((el) => Math.round(el.getBoundingClientRect().height))
        .catch(() => 0);
      await page.getByRole("button", { name: /account|menu/i }).first().click().catch(() => {});
      const emailLines = await page.locator('[role="menu"] >> text=/@/').count().catch(() => 0);
      const row10 = viewerH > 400 && emailLines <= 1;
      record("10", "also", browserName, vp, row10, `viewerH=${viewerH} emailLines=${emailLines}`);
    });
    }

    // Bea func5 matrix (subset) — bea-phone-3d-fs / bea-h1-care-sheet run as customer @390 (v14)
    if (vp < 1024) {
    await safeStep("bea-q35-tracking", "bea-smoke", browserName, vp, async () => {
      await page.goto(`${BASE}/staff/quotes/35`, { waitUntil: "domcontentloaded" });
      const tracking = await page.getByRole("heading", { name: /^tracking$/i }).isVisible().catch(() => false);
      record("bea-q35-tracking", "bea-smoke", browserName, vp, tracking, `tracking=${tracking}`);
    });
    }
    if (vp >= 1024) {
    await safeStep("bea-fs-strip-15px", "bea-smoke", browserName, vp, async () => {
      await page.goto(`${BASE}/machines/palletizer`, { waitUntil: "domcontentloaded" });
      await page.locator("canvas").first().waitFor({ timeout: 60_000 }).catch(() => {});
      await clickEnterViewerFullscreen(page);
      await page.waitForTimeout(700);
      const inFs = await readViewerFsMetrics(page);
      const mode = viewerFsMode(inFs);
      const entered =
        inFs.native ||
        (inFs.overlay && inFs.layoutH > Math.min(400, inFs.innerH * 0.45));
      await clickExitViewerFullscreen(page);
      const after = await readViewerFsMetrics(page);
      const layoutTop = after.layoutTop;
      const stripOk = entered && layoutTop <= 2 && !after.native && !after.overlay;
      record(
        "bea-fs-strip-15px",
        "bea-smoke",
        browserName,
        vp,
        stripOk,
        `mode=${mode} entered=${entered} layoutTop=${layoutTop} afterOverlay=${after.overlay}`,
      );
      await page.goto(`${BASE}/staff/quotes/35`, { waitUntil: "domcontentloaded" });
      const spacerH = await page.evaluate(() => {
        const spacer = document.querySelector(".conversation-sheet-spacer");
        return spacer ? Math.round(spacer.getBoundingClientRect().height) : 0;
      });
      const inlineMsgs = await page.locator(".conversation-sheet.is-inline").isVisible().catch(() => false);
      record(
        "bea-m7-q35-gap",
        "bea-smoke",
        browserName,
        vp,
        inlineMsgs && spacerH < 8,
        `inline=${inlineMsgs} spacerH=${spacerH}`,
      );
      await page.goto(`${BASE}/machines`, { waitUntil: "domcontentloaded" });
      const tMachines = await waitForDocumentTitle(page, /machines/i);
      record(
        "bea-title-machines",
        "bea-smoke",
        browserName,
        vp,
        /machines/i.test(tMachines) && /oee360/i.test(tMachines),
        tMachines,
      );
      await page.goto(`${BASE}/part-alerts`, { waitUntil: "domcontentloaded" });
      const tAlerts = await waitForDocumentTitle(page, /part alerts/i);
      record(
        "bea-title-part-alerts",
        "bea-smoke",
        browserName,
        vp,
        /part alerts/i.test(tAlerts) && /oee360/i.test(tAlerts),
        tAlerts,
      );
    });
    }

    // sam-stepper-label @390
    if (vp < 1024) {
    await safeStep("sam-stepper-label", "sam-stepper-label", browserName, vp, async () => {
      await page.goto(`${BASE}/staff/quotes/26`, { waitUntil: "domcontentloaded" });
      const fullLabel = await page.locator(".quote-progress-label-full").first().isVisible().catch(() => false);
      record("sam-stepper-label", "sam-stepper-label", browserName, vp, fullLabel, `fullLabel=${fullLabel}`);
    });
    }

    // v13 — live prod re-verify (#430) staff rows
    await safeStep("sam-qty-decimal-15", "money-qty", browserName, vp, async () => {
    await page.goto(`${BASE}/staff/quotes`, { waitUntil: "domcontentloaded" });
    await page.locator("ul a, ul button").first().click({ timeout: 20_000 });
    const qtyDec = page.getByLabel("Qty").first();
    await qtyDec.fill("1");
    await qtyDec.click({ clickCount: 3 });
    await qtyDec.pressSequentially("1.5");
    const decVal = await qtyDec.inputValue();
    const decErr = await page
      .getByRole("alert")
      .filter({ hasText: /whole numbers/i })
      .isVisible()
      .catch(() => false);
    const decPass = decVal.includes("1.5") && decErr;
    record("sam-qty-decimal-15", "money-qty", browserName, vp, decPass, `val=${decVal} err=${decErr}`);
    });

    await safeStep("sam-qty-invalid-refocus", "money-qty", browserName, vp, async () => {
    const qtyRef = page.getByLabel("Qty").first();
    await qtyRef.fill("-3");
    await qtyRef.blur();
    await qtyRef.focus();
    const refVal = await qtyRef.inputValue();
    const refErr = await page
      .getByRole("alert")
      .filter({ hasText: /negative/i })
      .isVisible()
      .catch(() => false);
    record(
      "sam-qty-invalid-refocus",
      "money-qty",
      browserName,
      vp,
      refVal.includes("-3") && refErr,
      `val=${refVal}`,
    );
    });

    if (vp < 1024) {
    await safeStep("sam-more-machines-onetap", "staff-nav", browserName, vp, async () => {
      await page.goto(`${BASE}/staff/parts`, { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: /^more$/i }).click();
      await page.getByRole("button", { name: /^machines$/i }).click();
      await page.waitForURL(/\/machines(?:\/|$|\?)/, { timeout: 15_000 });
      record(
        "sam-more-machines-onetap",
        "staff-nav",
        browserName,
        vp,
        /\/machines/.test(page.url()),
        page.url(),
      );
    });

    await safeStep("sam-messages-close-scroll", "phone-sheets", browserName, vp, async () => {
      let scrollPass = true;
      for (const ref of ["26", "29"]) {
        await openQuoteMessages(page, ref);
        const band = await ensureMessagesPeekBand(page);
        const hBefore = band.h;
        const closeBtn = page.getByRole("button", { name: /^close$/i });
        const closeBefore = await closeBtn.isVisible().catch(() => false);
        await tapOrClickClose(page, closeBtn, true);
        await waitConversationSheetResting(page);
        await page.waitForTimeout(350);
        const metricsAfterClose = await conversationSheetMetrics(page);
        const hAfterClose = metricsAfterClose.h;
        const grewOnClose = hAfterClose > hBefore + CLOSE_GROW_TOLERANCE_PX;
        const closeAfterClick = await closeBtn.isVisible().catch(() => false);
        const dismissedOk =
          metricsAfterClose.out && hAfterClose <= hBefore + CLOSE_GROW_TOLERANCE_PX + 4;
        const peekAfterOk =
          metricsAfterClose.peek &&
          hAfterClose <= PEEK_BAND_MAX_H &&
          closeAfterClick &&
          !grewOnClose;
        await page.evaluate(() => window.scrollBy(0, 260));
        await page.waitForTimeout(450);
        const afterScroll = await conversationSheetMetrics(page);
        const hScroll = afterScroll.h;
        const closeAfterScroll = await closeBtn.isVisible().catch(() => false);
        const stable =
          band.ok &&
          band.peek &&
          closeBefore &&
          !grewOnClose &&
          (dismissedOk || peekAfterOk) &&
          hScroll <= hBefore + CLOSE_GROW_TOLERANCE_PX + 8 &&
          hScroll <= Math.max(hAfterClose + 8, hAfterClose * 1.05) &&
          (closeAfterScroll || afterScroll.out);
        if (!stable) {
          scrollPass = false;
        }
      }
      record(
        "sam-messages-close-scroll",
        "phone-sheets",
        browserName,
        vp,
        scrollPass,
        `q26+q29 peek-close+scroll stable=${scrollPass}`,
      );
    });

    await safeStep("sam-care-sort-stable", "care-layout", browserName, vp, async () => {
      await page.goto(`${BASE}/care/tickets`, { waitUntil: "domcontentloaded" });
      await page.locator(".tickets-workspace-filter-row").waitFor({ state: "visible", timeout: 12_000 });
      const listTopBefore = await page
        .locator(".tickets-workspace-list")
        .boundingBox()
        .catch(() => null);
      const sortBoxBefore = await sortSelectOffsetInFilterRow(page);
      const overflowBefore = await horizontalOverflowPx(page, ".tickets-workspace-filter-row");
      const listOverflowBefore = await horizontalOverflowPx(page, ".tickets-workspace-list");
      const search = page.locator("#care-tickets-search");
      await search.click({ timeout: 8000 });
      await page.waitForTimeout(320);
      const sortBoxFocus = await sortSelectOffsetInFilterRow(page);
      const overflowFocus = await horizontalOverflowPx(page, ".tickets-workspace-filter-row");
      const listOverflowFocus = await horizontalOverflowPx(page, ".tickets-workspace-list");
      const listTopFocus = await page
        .locator(".tickets-workspace-list")
        .boundingBox()
        .catch(() => null);
      const focusStable =
        sortBoxBefore &&
        sortBoxFocus &&
        Math.abs(sortBoxBefore.y - sortBoxFocus.y) < 1 &&
        Math.abs(sortBoxBefore.x - sortBoxFocus.x) < 2 &&
        (!listTopBefore ||
          !listTopFocus ||
          Math.abs(listTopBefore.y - listTopFocus.y) < 2);
      const noOverflowOnFocus =
        overflowFocus.overflow <= 1 &&
        listOverflowFocus.overflow <= 1;
      await search.fill("pal");
      await page.waitForTimeout(500);
      const sortBoxAfter = await sortSelectOffsetInFilterRow(page);
      const overflowTyped = await horizontalOverflowPx(page, ".tickets-workspace-filter-row");
      const sortStable =
        sortBoxFocus &&
        sortBoxAfter &&
        Math.abs(sortBoxFocus.y - sortBoxAfter.y) < 1 &&
        Math.abs(sortBoxFocus.x - sortBoxAfter.x) < 2 &&
        overflowTyped.overflow <= 1;
      record(
        "sam-care-sort-stable",
        "care-layout",
        browserName,
        vp,
        Boolean(focusStable && noOverflowOnFocus && sortStable),
        `focusStable=${focusStable} overflowFocus=${overflowFocus.overflow}/${listOverflowFocus.overflow} typedOverflow=${overflowTyped.overflow} sort=${sortBoxBefore?.x},${sortBoxBefore?.y}→${sortBoxFocus?.x},${sortBoxFocus?.y}→${sortBoxAfter?.x},${sortBoxAfter?.y}`,
      );
    });

    await safeStep("sam-care-header-stable", "care-layout", browserName, vp, async () => {
      await page.goto(`${BASE}/care/tickets`, { waitUntil: "domcontentloaded" });
      const headBefore = await page.locator(".tickets-workspace-toolbar").boundingBox();
      await page
        .locator(".tickets-workspace-new")
        .click({ timeout: 8000 })
        .catch(() => {});
      await page.waitForTimeout(250);
      const headAfter = await page.locator(".tickets-workspace-toolbar").boundingBox();
      const headerStable =
        headBefore &&
        headAfter &&
        Math.abs(headBefore.y - headAfter.y) < 3 &&
        Math.abs(headBefore.x - headAfter.x) < 3;
      record(
        "sam-care-header-stable",
        "care-layout",
        browserName,
        vp,
        Boolean(headerStable),
        `dy=${headBefore && headAfter ? Math.round(headAfter.y - headBefore.y) : "na"}`,
      );
    });
    }

    await safeStep("sam-ticket-search-t9", "care-search", browserName, vp, async () => {
      let rankedOk = true;
      let detail = "";
      for (const query of ["T9", "9"]) {
        await page.goto(`${BASE}/care/tickets`, { waitUntil: "domcontentloaded" });
        await page.locator("#care-tickets-search").fill(query);
        await page
          .waitForFunction(
            () => {
              const first = document.querySelector(".tickets-workspace-list a.care-row");
              return Boolean(first && /Ticket\s+9\b/i.test(first.textContent ?? ""));
            },
            { timeout: 10_000 },
          )
          .catch(() => {});
        await page.waitForTimeout(250);
        const first = await page
          .locator(".tickets-workspace-list a.care-row")
          .first()
          .innerText()
          .catch(() => "");
        const firstIsNine = /Ticket\s+9\b/i.test(first);
        if (!firstIsNine) {
          rankedOk = false;
          detail += `q=${query} first=${first.slice(0, 48).replace(/\s+/g, " ")}; `;
        }
      }
      record(
        "sam-ticket-search-t9",
        "care-search",
        browserName,
        vp,
        rankedOk,
        rankedOk ? "rankedFirst=true" : detail.trim(),
      );
    });

    if (vp >= 1024) {

    await safeStep("bea-inline-messages-no-handle", "quote-messages", browserName, vp, async () => {
      await page.goto(`${BASE}/staff/quotes/26`, { waitUntil: "domcontentloaded" });
      await page
        .locator('[data-quote-layout="split"] .conversation-sheet.is-inline')
        .first()
        .waitFor({ state: "visible", timeout: 20_000 })
        .catch(() => {});
      const inlineMsgs = await page
        .locator(".conversation-sheet.is-inline")
        .isVisible()
        .catch(() => false);
      const handleHidden = await page
        .locator(".conversation-sheet.is-inline .snap-sheet-handle")
        .first()
        .evaluate((el) => getComputedStyle(el).display === "none")
        .catch(() => true);
      record(
        "bea-inline-messages-no-handle",
        "quote-messages",
        browserName,
        vp,
        inlineMsgs && handleHidden,
        `inline=${inlineMsgs} handleHidden=${handleHidden}`,
      );
    });
    }

    await context.close();
  }

  // Customer rows — separate context; one safeStep per row so row 9 cannot ABORT on later Add timeout
  const cust = await browser.newContext({
    viewport: viewportSize(1440),
    hasTouch: false,
  });
  await apiLogin(cust, CUSTOMER);
  const cp = await cust.newPage();

  await safeStep("9", "demo-hide-badge", browserName, 1440, async () => {
  await cp.goto(`${BASE}/care/tickets`, { waitUntil: "domcontentloaded" });
  const text = await cp.locator("main").innerText();
  const hidePass = !/\bticket\s+(1[7-9]|2[0-6])\b/i.test(text);
  record("9", "demo-hide-badge", browserName, 1440, hidePass, "17-26 hidden");
  });

  await safeStep("bea-ticket-10-title", "demo-titles", browserName, 1440, async () => {
  const text = await cp.locator("main").innerText();
  const t10Title = /stack light fault|palletizer infeed photo-eye/i.test(text);
  record("bea-ticket-10-title", "demo-titles", browserName, 1440, t10Title, "ticket10-realistic");
  });
  await safeStep("bea-title-customer-quotes", "bea-smoke", browserName, 1440, async () => {
  await cp.goto(`${BASE}/quotes`, { waitUntil: "domcontentloaded" });
  const tQuotesCustomer = await cp.title();
  record(
    "bea-title-customer-quotes",
    "bea-smoke",
    browserName,
    1440,
    /quotes/i.test(tQuotesCustomer) && /oee360/i.test(tQuotesCustomer),
    tQuotesCustomer,
  );
  });

  await safeStep("bea-q37-not-first", "bea-smoke", browserName, 1440, async () => {
  await cp.goto(`${BASE}/quotes`, { waitUntil: "domcontentloaded" });
  const firstQuote = (await cp.locator("ul li").first().innerText().catch(() => "")).slice(0, 80);
  const q37First = /quote\s*37\b/i.test(firstQuote);
  record("bea-q37-not-first", "bea-smoke", browserName, 1440, !q37First, `first=${firstQuote}`);
  });

  await safeStep("bea-drawer-vs-add", "bea-smoke", browserName, 1440, async () => {
  await cp.goto(`${BASE}/quotes`, { waitUntil: "domcontentloaded" });
  await cp.getByRole("button", { name: /new quote/i }).click({ timeout: 8000 }).catch(() => {});
  await cp.waitForTimeout(400);
  await cp.locator("ul a, ul button").first().click({ timeout: 8000 }).catch(() => {});
  await cp.waitForTimeout(400);
  const newFormOpen = await cp
    .getByRole("heading", { name: /new quote/i })
    .isVisible()
    .catch(() => false);
  record(
    "bea-drawer-vs-add",
    "bea-smoke",
    browserName,
    1440,
    !newFormOpen,
    `newFormOpen=${newFormOpen}`,
  );
  });

  const customerTenant = await tenantIdForContext(cust);

  await safeStep("bea-m9-undo-tray", "bea-smoke", browserName, 1440, async () => {
  await cp.goto(`${BASE}/machines/palletizer`, { waitUntil: "domcontentloaded" });
  await seedCustomerTray(cp, "palletizer", customerTenant);
  await cp.reload({ waitUntil: "domcontentloaded" });
  await cp.locator("canvas").first().waitFor({ state: "visible", timeout: 60_000 }).catch(() => {});
  const quoteChip = cp.getByRole("button", { name: /show quote/i }).first();
  await quoteChip.waitFor({ state: "visible", timeout: 15_000 });
  await quoteChip.click();
  const tray = cp
    .locator(
      ".quote-tray-dock.is-open [data-quote-tray], .machine-viewer [data-quote-tray]",
    )
    .first();
  await tray.waitFor({
    state: "visible",
    timeout: 12_000,
  });
  await tray.getByRole("button", { name: /^remove$/i }).click({ timeout: 10_000 });
  const undoBtn = cp.locator("[data-quote-undo-toast] .quote-undo-toast-action");
  await undoBtn.waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
  const undoVisible = await undoBtn.isVisible().catch(() => false);
  record(
    "bea-m9-undo-tray",
    "bea-smoke",
    browserName,
    1440,
    undoVisible,
    `undo=${undoVisible}`,
  );
  });

  await safeStep("bea-m9-tray-handle-lines", "bea-smoke", browserName, 1440, async () => {
  await cp.goto(`${BASE}/machines/palletizer`, { waitUntil: "domcontentloaded" });
  await seedCustomerTray(cp, "palletizer", customerTenant);
  await cp.reload({ waitUntil: "domcontentloaded" });
  await cp.locator("canvas").first().waitFor({ state: "visible", timeout: 60_000 }).catch(() => {});
  await cp.getByRole("button", { name: /show quote/i }).first().click({ timeout: 12_000 });
  const dockedTray = cp.locator(".quote-tray-dock.is-open [data-quote-tray]").first();
  await dockedTray.waitFor({ state: "visible", timeout: 12_000 }).catch(() => {});
  const trayFull = await cp
    .locator(".quote-tray-dock.is-open .quote-sheet.is-full")
    .isVisible()
    .catch(() => false);
  const removeBtn = dockedTray.getByRole("button", { name: /^remove$/i }).first();
  await removeBtn.waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
  const removeBox = await removeBtn.boundingBox();
  const removeVisible =
    Boolean(removeBox) &&
    removeBox.y >= 0 &&
    removeBox.y + removeBox.height <= cp.viewportSize().height;
  record(
    "bea-m9-tray-handle-lines",
    "bea-smoke",
    browserName,
    1440,
    trayFull && removeVisible,
    `dockFull=${trayFull} removeVisible=${removeVisible}`,
  );
  });

  await safeStep("bea-drawer-list-add", "bea-smoke", browserName, 1440, async () => {
  await cp.goto(`${BASE}/machines/palletizer`, { waitUntil: "domcontentloaded" });
  await seedCustomerTray(cp, "palletizer", customerTenant);
  await cp.reload({ waitUntil: "domcontentloaded" });
  await cp.locator("canvas").first().waitFor({ state: "visible", timeout: 60_000 }).catch(() => {});
  await cp.getByRole("button", { name: /^list$/i }).click({ timeout: 12_000 });
  const bomPanel = cp.locator("section[data-parts-bom]").first();
  await bomPanel.waitFor({ state: "visible", timeout: 15_000 });
  await cp.getByRole("button", { name: /show quote/i }).first().click({ timeout: 12_000 });
  const addButtons = bomPanel.getByRole("button", { name: /^add$/i });
  const addCount = await addButtons.count();
  const addReachability = [];
  let allAddReachable = addCount > 0;
  for (let i = 0; i < addCount; i += 1) {
    const addBtn = addButtons.nth(i);
    await addBtn.waitFor({ state: "visible", timeout: 15_000 });
    const addBox = await addBtn.boundingBox();
    if (!addBox) {
      allAddReachable = false;
      addReachability.push(`${i}=no-box`);
      continue;
    }
    const reachable = await cp.evaluate(
      ({ x, y }) => {
        const hit = document.elementFromPoint(x, y);
        if (!hit) {
          return false;
        }
        const label = hit.closest("button")?.textContent?.trim() ?? "";
        return /^add$/i.test(label);
      },
      { x: addBox.x + addBox.width / 2, y: addBox.y + addBox.height / 2 },
    );
    if (!reachable) {
      allAddReachable = false;
      addReachability.push(`${i}=blocked`);
    } else {
      addReachability.push(`${i}=ok`);
    }
  }
  record(
    "bea-drawer-list-add",
    "bea-smoke",
    browserName,
    1440,
    allAddReachable,
    `addCount=${addCount} ${addReachability.join(",")}`,
  );
  });

  await safeStep("bea-fs-viewer-stage", "bea-smoke", browserName, 1440, async () => {
  await cp.goto(`${BASE}/machines/palletizer`, { waitUntil: "domcontentloaded" });
  await cp.locator("canvas").first().waitFor({ state: "visible", timeout: 60_000 }).catch(() => {});
  await clickEnterViewerFullscreen(cp);
  await cp.waitForTimeout(700);
  const stageW = await cp.evaluate(() => {
    const layout = document.querySelector("[data-machine-viewer-layout]");
    return layout ? Math.round(layout.getBoundingClientRect().width) : 0;
  });
  record(
    "bea-fs-viewer-stage",
    "bea-smoke",
    browserName,
    1440,
    stageW >= Math.round(1440 * 0.92),
    `layoutW=${stageW}`,
  );
  await clickExitViewerFullscreen(cp);
  });

  await cust.close();

  await safeStep("bea-phone-3d-fs", "bea-smoke", browserName, 390, async () => {
    await runBeaPhone3dFs390(browserName, browser);
  });
  await safeStep("bea-m9-phone-390", "bea-smoke", browserName, 390, async () => {
    await runBeaM9Phone390(browserName, browser);
  });
  await safeStep("bea-h1-care-sheet", "bea-smoke", browserName, 390, async () => {
    await runBeaH1CareSheet390(browserName, browser);
  });

  for (const hwVp of viewports) {
    if (hwVp === 390 || hwVp === 1440) {
      await runBeaHardwareFixtureGateRows(browserName, browser, hwVp);
    }
  }

  await browser.close();
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const launchers = {
    chrome: chromium,
    chromium,
    webkit,
  };
  let fatalError = null;
  try {
    for (const name of browsers) {
      const launch = launchers[name];
      if (!launch) {
        console.warn("skip unknown browser", name);
        continue;
      }
      await runRows(name === "chrome" ? "chrome" : name, launch);
    }
  } catch (err) {
    fatalError = err;
    console.error(err);
  }
  const gateStatus = runs.length > 0 && runs.every((r) => r.pass) ? "PASS" : "FAIL";
  await flushGateResults(fatalError ? 1 : gateStatus === "PASS" ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await flushGateResults(1);
});
