#!/usr/bin/env node
/**
 * Step A.3 — Close button uses --sheet-close-ty to is-out @390 + @320.
 * Usage: node scripts/care-notes-chunk2/step-a3-preview-check.mjs [baseUrl] [outDir]
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

function sheetState(page) {
  return page.evaluate(() => {
    const s = document.querySelector(".conversation-sheet");
    const meta = window.QMeta?.() ?? {};
    const closeTy = s?.style.getPropertyValue("--sheet-close-ty").trim() || "";
    const restTy = s
      ? getComputedStyle(s).getPropertyValue("--sheet-close-rest-ty").trim()
      : "";
    return {
      classes: s?.className ?? "",
      isOut: s?.classList.contains("is-out"),
      isReply: s?.classList.contains("is-reply"),
      closeTy,
      restTy,
      scrollTop: meta.scrollTop ?? null,
      latestTop: meta.latestTop ?? null,
      latestId: meta.latestId ?? null,
    };
  });
}

async function tapClose(page) {
  await page.locator(".conversation-sheet-close").click();
  await page.waitForFunction(
    () => document.querySelector(".conversation-sheet")?.classList.contains("is-out"),
    { timeout: 8_000 },
  );
  await page.waitForTimeout(450);
}

async function dragCloseFromReply(page) {
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
  const before = await sheetState(page);
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
  await page.waitForTimeout(450);
  const after = await sheetState(page);
  return { before, after, meta };
}

async function openFromClosed(page) {
  const grabY = await page.evaluate(() => {
    const handle = document.querySelector(".snap-sheet-handle");
    const box = handle?.getBoundingClientRect();
    return box ? Math.round(box.y + box.height / 2) : 400;
  });
  await page.evaluate(async (y) => {
    await window.SD(y, y - 40, 4, 60, true);
  }, grabY);
  await page.waitForFunction(
    () => !document.querySelector(".conversation-sheet")?.classList.contains("is-out"),
    { timeout: 15_000 },
  );
  await page.waitForTimeout(400);
}

async function openFull(page) {
  await page.locator(".snap-sheet-handle").click();
  await page.waitForTimeout(500);
  await page.waitForFunction(
    () => document.querySelector(".conversation-sheet")?.classList.contains("is-full"),
    { timeout: 8_000 },
  );
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

  const restBefore = await sheetState(page);
  await tapClose(page);
  const tapRestClosed = await sheetState(page);

  await openFromClosed(page);
  const drag = await dragCloseFromReply(page);
  const dragClosed = drag.after;

  await openFromClosed(page);
  await openFull(page);
  const fullBefore = await sheetState(page);
  await tapClose(page);
  const tapFullClosed = await sheetState(page);

  const videoPath = await page.video()?.path();
  await context.close();
  await browser.close();

  const renamed = join(outDir, `step-a3-${label}.webm`);
  if (videoPath) {
    const { renameSync } = await import("node:fs");
    try {
      renameSync(videoPath, renamed);
    } catch {
      // keep default video name if rename races
    }
  }

  const failures = [];
  if (!tapRestClosed.isOut) failures.push("tap from rest: not is-out");
  if (!tapRestClosed.isReply) failures.push("tap from rest: missing is-reply");
  if (!tapFullClosed.isOut) failures.push("tap from full: not is-out");
  if (!dragClosed.isOut) failures.push("drag close: not is-out");
  if (tapRestClosed.latestId !== restBefore.latestId) {
    failures.push("tap rest: latest row id changed");
  }
  if (
    dragClosed.restTy &&
    tapRestClosed.restTy &&
    dragClosed.restTy !== tapRestClosed.restTy
  ) {
    failures.push(`rest ty mismatch tap=${tapRestClosed.restTy} drag=${dragClosed.restTy}`);
  }

  return {
    label,
    restBefore,
    tapRestClosed,
    dragClosed,
    fullBefore,
    tapFullClosed,
    failures,
    video: renamed,
  };
}

const results = [];
for (const [w, h, label] of [
  [390, 844, "390"],
  [320, 568, "320"],
]) {
  results.push(await runViewport(w, h, label));
}

writeFileSync(join(outDir, `step-a3-preview-${Date.now()}.json`), JSON.stringify(results, null, 2));

const all = results.flatMap((r) => r.failures.map((f) => `${r.label}: ${f}`));
if (all.length) {
  console.error("STEP A.3 FAIL\n" + all.join("\n"));
  process.exit(1);
}
console.log("STEP A.3 PASS", JSON.stringify(results, null, 2));
