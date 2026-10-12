#!/usr/bin/env node
/**
 * rv421 / rv428 Mac proof gate (v3) — prod-identical disposable store + Bea/Sam flows.
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

async function assertCloseSettlesPeek(page, row, folder, browser, vp) {
  const handle = page.locator(".snap-sheet-handle").first();
  const before = await handle.boundingBox().catch(() => null);
  await page.getByRole("button", { name: /^close$/i }).click({ timeout: 8000 });
  await page.waitForTimeout(600);
  const card = page.locator(".conversation-sheet").first();
  const afterH = await card.evaluate((el) => el.getBoundingClientRect().height);
  const peek = await card.evaluate((el) => el.classList.contains("is-peek"));
  const pass = peek || afterH < (before?.height ?? 900) * 0.72;
  const shots = [
    await shot(page, folder, `${row}-${browser}-${vp}-close.png`),
  ];
  record(row, folder, browser, vp, pass, `peek=${peek} h=${Math.round(afterH)}`, shots);
}

async function runRows(browserName, launch) {
  const browser = await launch.launch({ headless: true });
  for (const vp of viewports) {
    const size = viewportSize(vp);
    const context = await browser.newContext({ viewport: size });
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
    const lockCopy = await page.getByText(/locked after PO/i).isVisible().catch(() => false);
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

    // Row 8 view part
    await page.goto(`${BASE}/machines/hardware-fixture`, { waitUntil: "domcontentloaded" });
    const viewPart = await page
      .locator("[data-machine-lifecycle-links] a, a[href*='part-lifecycle']")
      .first()
      .isVisible()
      .catch(() => false);
    record("8", "machines-m", browserName, vp, viewPart, `viewPart=${viewPart}`);

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
    `**Harness:** \`scripts/rv421-mac-proof-gate.mjs\` (v3)`,
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
