#!/usr/bin/env node
/**
 * Bea-style slow synthetic touch drag (5px / 80ms per step) with per-frame geometry +
 * class-change watch. Use against live oee360.com or local prod after each merge.
 *
 * Usage:
 *   node scripts/care-notes-chunk2/slow-drag-live.mjs <baseUrl> [outDir] [quoteId]
 *
 * Env: STAFF_EMAIL, STAFF_PASSWORD (defaults match local preview fixture login).
 */
import { chromium, devices } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const baseUrl = (process.argv[2] || "https://oee360.com").replace(/\/$/, "");
const outDir = process.argv[3] || "/cursor/stores/self/media/care-notes-chunk2";
const quoteId = process.argv[4] || "quote-preview-qa-conversation";
const stepPx = 5;
const stepMs = 80;

const staffEmail = process.env.STAFF_EMAIL || "staff@spares.local";
const staffPassword = process.env.STAFF_PASSWORD || "SparesStaff1!";

mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const logPath = join(outDir, `slow-drag-${stamp}.jsonl`);
const videoDir = join(outDir, "videos");
mkdirSync(videoDir, { recursive: true });

function logLine(obj) {
  const line = JSON.stringify({ t: Date.now(), ...obj });
  writeFileSync(logPath, `${line}\n`, { flag: "a" });
  console.log(line);
}

async function readFrame(page) {
  return page.evaluate(() => {
    const card = document.querySelector("[data-conversation-sheet]");
    const thread = card?.querySelector(".imsg-thread");
    const composer = card?.querySelector(".imsg-composer");
    const rows = [...(thread?.querySelectorAll(":scope > li") ?? [])];
    const last = rows.at(-1);
    const cardBox = card?.getBoundingClientRect();
    const composerBox = composer?.getBoundingClientRect();
    const lastBox = last?.getBoundingClientRect();
    const sheetH = card ? Number.parseFloat(getComputedStyle(card).getPropertyValue("--sheet-h")) : NaN;
    const phaseA = card ? Number(getComputedStyle(card).getPropertyValue("--phase-a")) : NaN;
    const phaseB = card ? Number(getComputedStyle(card).getPropertyValue("--phase-b")) : NaN;
    const composerSeat = card
      ? getComputedStyle(card).getPropertyValue("--composer-seat-h").trim()
      : "";
    return {
      classes: card?.className ?? "",
      snap: card?.getAttribute("data-snap") ?? null,
      sheetTop: cardBox ? Math.round(cardBox.top) : null,
      sheetBottom: cardBox ? Math.round(cardBox.bottom) : null,
      sheetHpx: cardBox ? Math.round(cardBox.height) : null,
      sheetHVar: Number.isFinite(sheetH) ? Math.round(sheetH) : null,
      phaseA: Number.isFinite(phaseA) ? Math.round(phaseA * 1000) / 1000 : null,
      phaseB: Number.isFinite(phaseB) ? Math.round(phaseB * 1000) / 1000 : null,
      composerSeat,
      composerTop: composerBox ? Math.round(composerBox.top) : null,
      composerBottom: composerBox ? Math.round(composerBox.bottom) : null,
      composerH: composerBox ? Math.round(composerBox.height) : null,
      lastTop: lastBox ? Math.round(lastBox.top) : null,
      lastBottom: lastBox ? Math.round(lastBox.bottom) : null,
    };
  });
}

function deltas(prev, next) {
  if (!prev || !next) return {};
  return {
    dFingerY: next.fingerY != null && prev.fingerY != null ? next.fingerY - prev.fingerY : null,
    dSheetTop: next.sheetTop != null && prev.sheetTop != null ? next.sheetTop - prev.sheetTop : null,
    dComposerTop:
      next.composerTop != null && prev.composerTop != null ? next.composerTop - prev.composerTop : null,
    dLastTop: next.lastTop != null && prev.lastTop != null ? next.lastTop - prev.lastTop : null,
  };
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  ...devices["iPhone 13"],
  viewport: { width: 393, height: 852 },
  recordVideo: { dir: videoDir, size: { width: 393, height: 852 } },
});
const page = await context.newPage();

const login = await page.request.post(`${baseUrl}/api/auth/login`, {
  data: { email: staffEmail, password: staffPassword },
});
if (!login.ok()) {
  console.error("login failed", login.status(), await login.text());
  process.exit(1);
}

if (baseUrl.includes("127.0.0.1") || baseUrl.includes("localhost")) {
  await page.request.post(`${baseUrl}/api/staff/quotes/preview-fixture`);
  for (let n = 1; n <= 8; n += 1) {
    await page.request.post(`${baseUrl}/api/quotes/${quoteId}/activity`, {
      data: { text: `History line ${n} for slow-drag probe.` },
    });
  }
}

const path = `/staff/quotes/${quoteId}?sheetDebug=1`;
await page.goto(`${baseUrl}${path}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.locator("[data-conversation-sheet]").first().waitFor({ state: "visible", timeout: 60_000 });
await page.waitForTimeout(600);

const handle = page.locator(".snap-sheet-handle").first();
const box = await handle.boundingBox();
if (!box) {
  console.error("no handle");
  process.exit(2);
}
const x = box.x + box.width / 2;
let fingerY = box.y + box.height / 2;

const failures = [];
let prev = null;
let prevClasses = null;

async function sample(phase, step) {
  const geom = await readFrame(page);
  const row = { phase, step, fingerY: Math.round(fingerY), ...geom, ...deltas(prev, { fingerY, ...geom }) };
  logLine(row);
  if (prev) {
    const fingerDy = row.dFingerY ?? 0;
    if (fingerDy !== 0) {
      for (const [key, label] of [
        ["dSheetTop", "sheet"],
        ["dComposerTop", "composer"],
        ["dLastTop", "last message"],
      ]) {
        const d = row[key];
        if (d == null) continue;
        if (Math.abs(d - fingerDy) > 4 && Math.abs(d) > 4) {
          failures.push(`${phase} step ${step}: ${label} delta ${d} vs finger ${fingerDy}`);
        }
      }
      if (Math.abs(row.dComposerTop ?? 0) > 4 && Math.abs(row.dComposerTop ?? 0) > 80) {
        failures.push(`${phase} step ${step}: composer threshold jump ${row.dComposerTop}`);
      }
    }
  }
  if (prevClasses && geom.classes !== prevClasses) {
    const peekToReply =
      /\bis-peek\b/.test(prevClasses) &&
      !/\bis-peek\b/.test(geom.classes) &&
      /\bis-reply\b/.test(geom.classes);
    if (peekToReply && (prev?.phase === "drag" || phase === "settle")) {
      failures.push(`${phase} step ${step}: class flip is-peek→is-reply mid motion`);
    }
  }
  prev = { fingerY, ...geom, phase };
  prevClasses = geom.classes;
}

await sample("rest", 0);

// Slow pull down through peek → composer band (expand finger Y).
await page.touchscreen.tap(x, fingerY);
await page.evaluate(
  ({ x, y }) => {
    const el = document.querySelector(".snap-sheet-handle");
    el?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: x, clientY: y, pointerId: 1, pointerType: "touch" }));
  },
  { x, y: fingerY },
);

const dragSteps = 52;
for (let i = 1; i <= dragSteps; i += 1) {
  fingerY += stepPx;
  await page.evaluate(
    ({ x, y }) => {
      const card = document.querySelector("[data-conversation-sheet]");
      card?.dispatchEvent(
        new PointerEvent("pointermove", { bubbles: true, clientX: x, clientY: y, pointerId: 1, pointerType: "touch" }),
      );
    },
    { x, y: fingerY },
  );
  await page.waitForTimeout(stepMs);
  await sample("drag", i);
}

// Mid-drag release
await page.evaluate(
  ({ x, y }) => {
    const card = document.querySelector("[data-conversation-sheet]");
    card?.dispatchEvent(
      new PointerEvent("pointerup", { bubbles: true, clientX: x, clientY: y, pointerId: 1, pointerType: "touch" }),
    );
  },
  { x, y: fingerY },
);

for (let f = 0; f < 35; f += 1) {
  await page.waitForTimeout(stepMs);
  await sample("settle", f);
}

writeFileSync(
  join(outDir, `slow-drag-${stamp}-summary.json`),
  JSON.stringify({ baseUrl, failures, logPath }, null, 2),
);
console.log("log:", logPath);
if (failures.length) {
  console.error("FAILURES:\n" + failures.join("\n"));
  await context.close();
  await browser.close();
  process.exit(1);
}
console.log("PASS slow-drag gate");
await context.close();
await browser.close();
