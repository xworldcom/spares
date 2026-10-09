#!/usr/bin/env node
/**
 * Step A.2 — side-by-side header proof @390 + @320 (open / reply / closed).
 * Usage: node scripts/care-notes-chunk2/step-a2-preview-check.mjs [baseUrl] [outDir]
 */
import { chromium, devices } from "playwright";
import { readFileSync } from "node:fs";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const beaSd = readFileSync(join(__dirname, "bea-sd6.js"), "utf8");

const baseUrl = (process.argv[2] || "http://127.0.0.1:3000").replace(/\/$/, "");
const outDir = process.argv[3] || "/cursor/stores/self/media/care-notes-chunk2";
mkdirSync(outDir, { recursive: true });

const quoteId = "quote-preview-qa-conversation";

function headerMetrics(page) {
  return page.evaluate(() => {
    const sheet = document.querySelector(".conversation-sheet");
    const title = document.querySelector(".conversation-sheet-toolbar-title");
    const handle = document.querySelector(".snap-sheet-handle");
    const sr = sheet?.getBoundingClientRect();
    const tr = title?.getBoundingClientRect();
    const hr = handle?.getBoundingClientRect();
    const cs = title ? getComputedStyle(title) : null;
    return {
      classes: sheet?.className ?? "",
      titleText: title?.textContent?.trim() ?? "",
      offsetFromSheetTop: sr && tr ? Math.round(tr.top - sr.top) : null,
      titleFontSize: cs?.fontSize ?? null,
      titleFontWeight: cs?.fontWeight ?? null,
      handleOffsetFromSheetTop: sr && hr ? Math.round(hr.top - sr.top) : null,
      titleVisible: tr ? tr.height > 0 && tr.width > 0 : false,
    };
  });
}

async function prepare(page) {
  const login = await page.request.post(`${baseUrl}/api/auth/login`, {
    data: { email: "staff@spares.local", password: "SparesStaff1!" },
  });
  if (!login.ok()) throw new Error(`login ${login.status()}`);
  await page.request.post(`${baseUrl}/api/staff/quotes/preview-fixture`);
  await page.goto(`${baseUrl}/staff/quotes/${quoteId}?sheetDebug=1`, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  await page.locator("[data-conversation-sheet]").first().waitFor({ state: "visible", timeout: 60_000 });
  await page.evaluate(beaSd);
}

async function closeSheet(page) {
  const meta = await page.evaluate(() => {
    const handle = document.querySelector(".snap-sheet-handle");
    const box = handle?.getBoundingClientRect();
    const composer = document.querySelector(".imsg-composer");
    const composerH = composer ? composer.offsetHeight : 64;
    const probe = document.createElement("div");
    probe.style.paddingBottom = "env(safe-area-inset-bottom)";
    document.body.appendChild(probe);
    const safe = Number.parseFloat(getComputedStyle(probe).paddingBottom) || 0;
    document.body.removeChild(probe);
    const grabY = box ? Math.round(box.y + box.height / 2) : 400;
    return { grabY, closeMax: Math.ceil(composerH + safe) };
  });
  await page.evaluate(
    async ({ fromY, toY }) => {
      await window.SD(fromY, toY, 5, 80, true);
    },
    { fromY: meta.grabY, toY: meta.grabY + meta.closeMax },
  );
  await page.waitForFunction(
    () => document.querySelector(".conversation-sheet")?.classList.contains("is-out"),
    { timeout: 15_000 },
  );
}

async function openFull(page) {
  const handle = page.locator(".snap-sheet-handle");
  await handle.click();
  await page.waitForTimeout(400);
}

async function fullReachMetrics(page) {
  return page.evaluate(() => {
    const header = document.querySelector(".spares-header");
    const handle = document.querySelector(".snap-sheet-handle");
    const hr = handle?.getBoundingClientRect();
    const hb = header?.getBoundingClientRect().bottom ?? 0;
    const vv = window.visualViewport;
    return {
      scrollTop: document.scrollingElement?.scrollTop ?? 0,
      handleTop: hr ? Math.round(hr.top) : null,
      headerBottom: Math.round(hb),
      vvTop: vv ? Math.round(vv.offsetTop) : 0,
      vvHeight: vv ? Math.round(vv.height) : window.innerHeight,
      reachable: hr ? hr.top >= hb - 2 : false,
      sheetFull: document.querySelector(".conversation-sheet")?.classList.contains("is-full"),
    };
  });
}

async function runViewport(width, height, label) {
  const videoDir = join(outDir, "videos");
  mkdirSync(videoDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ...devices["iPhone 13"],
    viewport: { width, height },
    recordVideo: { dir: videoDir, size: { width, height } },
  });
  const page = await context.newPage();
  await prepare(page);

  const reply = await headerMetrics(page);
  await page.screenshot({ path: join(outDir, `step-a2-${label}-reply-scroll0.png`) });

  await page.evaluate(() => {
    document.scrollingElement?.scrollTo(0, 0);
  });
  await page.waitForTimeout(200);
  await openFull(page);
  const fullScroll0 = await headerMetrics(page);
  const fullReachScroll0 = await fullReachMetrics(page);
  await page.screenshot({ path: join(outDir, `step-a2-${label}-full-scroll0.png`) });

  await page.evaluate(() => {
    const el = document.scrollingElement;
    if (el) el.scrollTop = Math.min(280, el.scrollHeight - el.clientHeight);
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    const btn = document.querySelector(".conversation-sheet-close");
    btn?.click();
  });
  await page.waitForTimeout(300);
  await openFull(page);
  const fullScrolled = await headerMetrics(page);
  const fullReachScrolled = await fullReachMetrics(page);
  await page.screenshot({ path: join(outDir, `step-a2-${label}-full-scrolled.png`) });

  await page.evaluate(() => {
    const btn = document.querySelector(".conversation-sheet-close");
    btn?.click();
  });
  await page.waitForTimeout(400);
  const reply2 = await headerMetrics(page);

  await closeSheet(page);
  const closed = await headerMetrics(page);
  await page.screenshot({ path: join(outDir, `step-a2-${label}-closed.png`) });

  const video = await page.video()?.path();
  await context.close();
  await browser.close();

  const failures = [];
  if (!reply.titleText.includes("Messages")) failures.push("reply: no Messages");
  if (!closed.titleText.includes("Messages")) failures.push("closed: no Messages");
  if (!closed.titleVisible) failures.push("closed: title not visible");

  const ref = reply;
  for (const [name, m] of [
    ["reply2", reply2],
    ["closed", closed],
  ]) {
    if (
      m.offsetFromSheetTop != null &&
      ref.offsetFromSheetTop != null &&
      Math.abs(m.offsetFromSheetTop - ref.offsetFromSheetTop) > 2
    ) {
      failures.push(`${name}: title offset ${m.offsetFromSheetTop} !== ${ref.offsetFromSheetTop}`);
    }
    if (m.titleFontSize !== ref.titleFontSize || m.titleFontWeight !== ref.titleFontWeight) {
      failures.push(`${name}: title style drift`);
    }
  }

  if (!fullReachScroll0.sheetFull) failures.push("full scroll0: not is-full");
  if (!fullReachScroll0.reachable) {
    failures.push(`full scroll0: grab under header ${JSON.stringify(fullReachScroll0)}`);
  }
  if (!fullReachScrolled.reachable) {
    failures.push(`full scrolled: grab under header ${JSON.stringify(fullReachScrolled)}`);
  }

  return {
    label,
    reply,
    reply2,
    closed,
    fullScroll0,
    fullReachScroll0,
    fullScrolled,
    fullReachScrolled,
    failures,
    video,
  };
}

const results = [];
for (const [w, h, label] of [
  [390, 844, "390"],
  [320, 568, "320"],
]) {
  results.push(await runViewport(w, h, label));
}

writeFileSync(join(outDir, `step-a2-preview-${Date.now()}.json`), JSON.stringify(results, null, 2));

const all = results.flatMap((r) => r.failures.map((f) => `${r.label}: ${f}`));
if (all.length) {
  console.error("STEP A.2 FAIL\n" + all.join("\n"));
  process.exit(1);
}
console.log("STEP A.2 PASS", JSON.stringify(results, null, 2));
