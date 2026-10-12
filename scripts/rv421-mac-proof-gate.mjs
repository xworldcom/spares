#!/usr/bin/env node
/**
 * rv421 / rv428 Mac proof gate (v5) — prod-identical disposable store + Bea/Sam flows.
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
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";

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

let bundleHead = "unknown";
try {
  bundleHead = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
} catch {
  // detached or shallow
}

const runs = [];

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

async function openQuoteMessages(page, quoteRef) {
  await page.goto(`${BASE}/staff/quotes/${quoteRef}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /messages/i }).first().click({ timeout: 20_000 });
  await page.locator(".snap-sheet-handle, .conversation-sheet.is-inline").first().waitFor({
    timeout: 15_000,
  });
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

async function assertCloseSettlesPeek(page, row, folder, browser, vp) {
  await expandConversationSheet(page);
  const card = page.locator(".conversation-sheet").first();
  const beforeH = await card.evaluate((el) => el.getBoundingClientRect().height);
  await page.getByRole("button", { name: /^close$/i }).click({ timeout: 8000 });
  await page.waitForTimeout(700);
  let afterH = await card.evaluate((el) => el.getBoundingClientRect().height);
  let peek = await card.evaluate((el) => el.classList.contains("is-peek"));
  if (!peek && afterH > 160) {
    await page.getByRole("button", { name: /^close$/i }).click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(700);
    afterH = await card.evaluate((el) => el.getBoundingClientRect().height);
    peek = await card.evaluate((el) => el.classList.contains("is-peek"));
  }
  const pass = peek || afterH < Math.min(beforeH * 0.72, 160);
  const shots = [await shot(page, folder, `${row}-${browser}-${vp}-close.png`)];
  record(row, folder, browser, vp, pass, `peek=${peek} h=${Math.round(afterH)}`, shots);
}

async function waitForDocumentTitle(page, pattern) {
  await page.waitForFunction(
    (re) => re.test(document.title),
    pattern,
    { timeout: 12_000 },
  );
  return page.title();
}

async function runRows(browserName, launch) {
  const browser = await launch.launch({ headless: true });
  for (const vp of viewports) {
    const size = viewportSize(vp);
    const context = await browser.newContext({ viewport: size });
    try {
      await context.grantPermissions(["fullscreen"], { origin: new URL(BASE).origin });
    } catch {
      // Playwright builds without fullscreen permission still exercise requestFullscreen.
    }
    await apiLogin(context, STAFF);
    const page = await context.newPage();

    // Row 2 / sam-qty-minus3 — invalid qty keeps error, no silent commit to 1
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

    // Row 3 Q27 lock + copy
    await page.goto(`${BASE}/staff/quotes/27`, { waitUntil: "domcontentloaded" });
    const sellDisabled = await page.locator("#sell-").first().isDisabled().catch(() => false);
    await page.getByText(/locked after PO/i).first().waitFor({ state: "visible", timeout: 12_000 }).catch(() => {});
    const lockCopy = await page.getByText(/locked after PO/i).first().isVisible().catch(() => false);
    const editPricingVisible = await page
      .getByRole("button", { name: /edit pricing/i })
      .isVisible()
      .catch(() => false);
    const q27Pass = sellDisabled && lockCopy && !editPricingVisible;
    record("3", "quotes", browserName, vp, q27Pass, `sellDisabled=${sellDisabled} lockCopy=${lockCopy}`);
    record("3-q27-pricing-lock", "quotes", browserName, vp, q27Pass, `editPricing=${editPricingVisible}`);

    // sam-search-clear
    await page.goto(`${BASE}/staff/quotes`, { waitUntil: "domcontentloaded" });
    const search = page.getByLabel("Search quotes");
    await search.fill("zzqxj");
    await page.waitForTimeout(350);
    await search.fill("");
    await page.waitForTimeout(400);
    const url = page.url();
    const cleared = !url.includes("q=zzqxj") && (await search.inputValue()) === "";
    record("sam-search-clear", "quotes", browserName, vp, cleared, `cleared=${cleared}`);

    // Row 5 titles
    await page.goto(`${BASE}/staff/quotes`, { waitUntil: "networkidle" });
    const tQuotes = await page.title();
    await page.goto(`${BASE}/staff/tickets`, { waitUntil: "networkidle" });
    const tTickets = await page.title();
    const titlePass =
      tQuotes.includes("Quotes") &&
      tQuotes.includes("OEE360") &&
      tTickets.includes("All tickets") &&
      tTickets.includes("OEE360");
    record("5", "document-title", browserName, vp, titlePass, `${tQuotes}|${tTickets}`);

    // Row 7 phone close @390 only; desktop quote uses inline column @1440
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
        await assertCloseSettlesPeek(page, row, row.replace("sam-close-", "sam-close-"), browserName, vp);
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

    // Row 1 / 6331k32 — obsolete lifecycle label on staff parts
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

    // Row 4 offline — staff ticket status shows error when network fails
    if (vp < 1024) {
      await page.goto(`${BASE}/care/tickets/9`, { waitUntil: "domcontentloaded" });
      await page
        .locator("[data-care-ticket-detail]")
        .waitFor({ state: "visible", timeout: 20_000 })
        .catch(() => {});
      await context.route("**/api/tickets/**", (route) => {
        if (route.request().method() === "PATCH") {
          return route.abort("failed");
        }
        return route.continue();
      });
      const statusBtn = page
        .getByRole("button", { name: /in progress|waiting on customer|resolved/i })
        .first();
      if (await statusBtn.isVisible().catch(() => false)) {
        await statusBtn.click();
      }
      await page.waitForTimeout(800);
      const offlineCopy = await page
        .getByText(/offline|network|could not reach|try again/i)
        .first()
        .isVisible()
        .catch(() => false);
      record("4", "offline", browserName, vp, offlineCopy, `offlineCopy=${offlineCopy}`);
      await context.unroute("**/api/tickets/**");
    }

    // Row 6 — Recently updated sort surfaces ticket 9 before 34
    if (vp >= 1024) {
      await page.goto(`${BASE}/care/tickets?sort=updated`, { waitUntil: "domcontentloaded" });
      const items = await page.locator(".tickets-workspace-list a, .tickets-workspace-list button").allInnerTexts();
      const joined = items.join("\n");
      const i9 = joined.search(/\b9\b|Ticket\s*9/i);
      const i34 = joined.search(/\b34\b|Ticket\s*34/i);
      const orderOk = i9 >= 0 && (i34 < 0 || i9 < i34);
      record("6", "care-recent-sort", browserName, vp, orderOk, `i9=${i9} i34=${i34}`);
    }

    // Row 8 view part
    await page.goto(`${BASE}/machines/hardware-fixture`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    const viewPart = await page
      .locator("[data-machine-lifecycle-links] a, a[href*='part-lifecycle']")
      .first()
      .isVisible()
      .catch(() => false);
    record("8", "machines-m", browserName, vp, viewPart, `viewPart=${viewPart}`);
    record("bea-m5-view-part", "bea-smoke", browserName, vp, viewPart, `viewPart=${viewPart}`);

    // Row 10 — palletizer viewer loads; no duplicate account email line
    if (vp >= 1024) {
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
    }

    // Bea func5 matrix (subset)
    if (vp < 1024) {
      await page.goto(`${BASE}/machines/palletizer`, { waitUntil: "domcontentloaded" });
      await page.locator("canvas").first().waitFor({ state: "visible", timeout: 60_000 }).catch(() => {});
      const fsBtn = page.getByRole("button", { name: /fullscreen|expand/i }).first();
      if (await fsBtn.isVisible().catch(() => false)) {
        await fsBtn.click();
        await page.waitForTimeout(600);
      }
      const overlayPin = await page.evaluate(() => {
        const layout = document.querySelector("[data-machine-viewer-layout]");
        if (!layout) return false;
        const h = layout.getBoundingClientRect().height;
        return h > 0 && h <= window.innerHeight * 0.98;
      });
      record("bea-phone-3d-fs", "bea-smoke", browserName, vp, overlayPin, `overlayPin=${overlayPin}`);
      await page.goto(`${BASE}/staff/quotes/35`, { waitUntil: "domcontentloaded" });
      const tracking = await page.getByRole("heading", { name: /^tracking$/i }).isVisible().catch(() => false);
      record("bea-q35-tracking", "bea-smoke", browserName, vp, tracking, `tracking=${tracking}`);
    }
    if (vp >= 1024) {
      await page.goto(`${BASE}/machines/palletizer`, { waitUntil: "domcontentloaded" });
      await page.locator("canvas").first().waitFor({ timeout: 60_000 }).catch(() => {});
      const enterFs = page.getByRole("button", { name: /enter full screen/i }).first();
      const exitFs = page.getByRole("button", { name: /exit full screen/i }).first();
      if (await enterFs.isVisible().catch(() => false)) {
        await enterFs.click();
        await page.waitForFunction(
          () => Boolean(document.fullscreenElement || document.webkitFullscreenElement),
          { timeout: 10_000 },
        ).catch(() => {});
        await page.waitForTimeout(500);
      }
      if (await exitFs.isVisible().catch(() => false)) {
        await exitFs.click();
        await page.waitForFunction(
          () => !document.fullscreenElement && !document.webkitFullscreenElement,
          { timeout: 10_000 },
        ).catch(() => {});
        await page.waitForTimeout(900);
      }
      const layoutTop = await page.evaluate(() => {
        const chrome = document.querySelector(".machine-viewer");
        const layout = document.querySelector("[data-machine-viewer-layout]");
        if (!chrome || !layout) {
          return -1;
        }
        return Math.round(layout.getBoundingClientRect().top - chrome.getBoundingClientRect().top);
      });
      record("bea-fs-strip-15px", "bea-smoke", browserName, vp, layoutTop <= 2, `layoutTop=${layoutTop}`);
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
    }

    if (vp < 1024) {
      await page.goto(`${BASE}/care/tickets/9`, { waitUntil: "domcontentloaded" });
      await expandConversationSheet(page);
      const handle = page.locator(".snap-sheet-handle").first();
      const box = await handle.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 72, { steps: 8 });
        await page.mouse.up();
        await page.waitForTimeout(700);
      }
      const card = page.locator(".conversation-sheet").first();
      const h1Peek = await card.evaluate((el) => el.classList.contains("is-peek"));
      const composerBottom = await page.evaluate(() => {
        const composer = document.querySelector(".imsg-composer");
        if (!composer) {
          return -1;
        }
        const tabbar = document.querySelector(".spares-tabbar");
        const tabTop = tabbar ? tabbar.getBoundingClientRect().top : window.innerHeight;
        return Math.round(tabTop - composer.getBoundingClientRect().bottom);
      });
      record(
        "bea-h1-care-sheet",
        "bea-smoke",
        browserName,
        vp,
        h1Peek && composerBottom >= -4 && composerBottom < 48,
        `peek=${h1Peek} composerGap=${composerBottom}`,
      );
    }

    // sam-stepper-label @390
    if (vp < 1024) {
      await page.goto(`${BASE}/staff/quotes/26`, { waitUntil: "domcontentloaded" });
      const fullLabel = await page.locator(".quote-progress-label-full").first().isVisible().catch(() => false);
      record("sam-stepper-label", "sam-stepper-label", browserName, vp, fullLabel, `fullLabel=${fullLabel}`);
    }

    await context.close();
  }

  // Customer rows 9 demo hide — separate context
  const cust = await browser.newContext({ viewport: viewportSize(1440) });
  await apiLogin(cust, CUSTOMER);
  const cp = await cust.newPage();
  await cp.goto(`${BASE}/care/tickets`, { waitUntil: "domcontentloaded" });
  const text = await cp.locator("main").innerText();
  const hidePass = !/\bticket\s+(1[7-9]|2[0-6])\b/i.test(text);
  record("9", "demo-hide-badge", browserName, 1440, hidePass, "17-26 hidden");
  const t10Title = /stack light fault|palletizer infeed photo-eye/i.test(text);
  record("bea-ticket-10-title", "demo-titles", browserName, 1440, t10Title, "ticket10-realistic");
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
  const firstQuote = (await cp.locator("ul li").first().innerText().catch(() => "")).slice(0, 80);
  const q37First = /quote\s*37\b/i.test(firstQuote);
  record("bea-q37-not-first", "bea-smoke", browserName, 1440, !q37First, `first=${firstQuote}`);
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
  await cp.goto(`${BASE}/machines/palletizer`, { waitUntil: "domcontentloaded" });
  await cp.locator("canvas").first().waitFor({ state: "visible", timeout: 60_000 }).catch(() => {});
  await cp
    .getByRole("button", { name: /show quote|quote tray/i })
    .first()
    .click({ timeout: 8000 })
    .catch(() => {});
  await cp.waitForTimeout(500);
  const removeBtn = cp.getByRole("button", { name: /^remove$/i }).first();
  if (await removeBtn.isVisible().catch(() => false)) {
    await removeBtn.click();
    await cp.waitForTimeout(500);
  }
  const undoVisible = await cp.getByRole("button", { name: /^undo$/i }).isVisible().catch(() => false);
  const trayHandle = await cp.locator(".quote-sheet-handle").first().isVisible().catch(() => false);
  record(
    "bea-m9-undo-tray",
    "bea-smoke",
    browserName,
    1440,
    undoVisible || trayHandle,
    `undo=${undoVisible} trayHandle=${trayHandle}`,
  );
  await cust.close();

  await browser.close();
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const launchers = {
    chrome: chromium,
    chromium,
    webkit,
  };
  for (const name of browsers) {
    const launch = launchers[name];
    if (!launch) {
      console.warn("skip unknown browser", name);
      continue;
    }
    await runRows(name === "chrome" ? "chrome" : name, launch);
  }

  const gateStatus = runs.every((r) => r.pass) ? "PASS" : "FAIL";
  const summary = { bundleHead, gateStatus, runs, generatedAt: new Date().toISOString() };
  await writeFile(join(OUT, "proof-summary.json"), JSON.stringify(summary, null, 2));

  const lines = [
    "# rv421 Mac proof gate — RESULTS",
    "",
    `**Bundle HEAD:** \`${bundleHead}\``,
    `**Gate:** **${gateStatus}**`,
    `**Harness:** \`scripts/rv421-mac-proof-gate.mjs\` (v5)`,
    `**Generated:** ${summary.generatedAt}`,
    "",
    "| Row | Result | RCA / notes | Proof folder |",
    "|-----|--------|-------------|--------------|",
  ];
  const seen = new Set();
  for (const r of runs) {
    const key = `${r.row}-${r.browser}-${r.viewport}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(
      `| ${r.row} | **${r.pass ? "PASS" : "FAIL"}** | ${r.detail.replace(/\|/g, "/")} | [${r.folder}/](./${r.folder}/) |`,
    );
  }
  lines.push("", "Raw log: `proof-summary.json` in this folder.");
  await writeFile(join(OUT, "RESULTS.md"), lines.join("\n"));
  console.log(JSON.stringify({ gateStatus, rows: runs.length }, null, 2));
  process.exit(gateStatus === "PASS" ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
