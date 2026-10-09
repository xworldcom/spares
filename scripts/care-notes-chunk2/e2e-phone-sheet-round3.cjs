#!/usr/bin/env node
/**
 * Round 3 — Bea gates @ 320 and 390: distinct detents, slow composer stop,
 * stable peek after 3 cycles, release thread/composer gap ≤2px.
 *
 * Usage: node scripts/care-notes-chunk2/e2e-phone-sheet-round3.cjs <baseUrl> <w> <h>
 */
const { chromium } = require("playwright");
const { cdpTouchDrag, readSheetGeom, waitSheetSettled } = require("./gesture-lib.cjs");

const baseUrl = process.argv[2] || "http://127.0.0.1:3010";
const width = Number(process.argv[3] || 320);
const height = Number(process.argv[4] || 568);

async function seedQuote(page) {
  const login = await page.request.post(`${baseUrl}/api/auth/login`, {
    data: { email: "staff@spares.local", password: "SparesStaff1!" },
  });
  if (!login.ok()) throw new Error(`login ${login.status()}`);
  await page.request.post(`${baseUrl}/api/staff/quotes/preview-fixture`);
  const quoteId = "quote-preview-qa-conversation";
  await page.request.patch(`${baseUrl}/api/quotes/${quoteId}/assistant`, {
    data: { paused: true },
  });
  for (let n = 1; n <= 2; n += 1) {
    const sent = await page.request.post(`${baseUrl}/api/quotes/${quoteId}/activity`, {
      data: { text: `Short line ${n} for round3 detents.` },
    });
    if (!sent.ok()) throw new Error(`seed ${n} ${sent.status()}`);
  }
}

function measureFrame(page) {
  return page.evaluate(() => {
    const card = document.querySelector("[data-conversation-sheet]");
    const thread = card?.querySelector(".imsg-thread");
    const composer = card?.querySelector(".imsg-composer");
    const rows = [...(thread?.querySelectorAll(":scope > li") ?? [])];
    const last = rows.at(-1);
    const lastBox = last?.getBoundingClientRect();
    const composerBox = composer?.getBoundingClientRect();
    const threadBox = thread?.getBoundingClientRect();
    const cardBox = card?.getBoundingClientRect();
    const phaseA = Number(getComputedStyle(card).getPropertyValue("--phase-a")) || 0;
    const gap =
      lastBox && composerBox ? Math.round(composerBox.top - lastBox.bottom) : null;
    return {
      snap: card?.getAttribute("data-snap"),
      phaseA: Math.round(phaseA * 100) / 100,
      sheetH: cardBox ? Math.round(cardBox.height) : null,
      threadTop: threadBox ? Math.round(threadBox.top) : null,
      composerTop: composerBox ? Math.round(composerBox.top) : null,
      gap,
    };
  });
}

async function run() {
  const failures = [];
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width, height },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await seedQuote(page);
  await page.goto(`${baseUrl}/staff/quotes/quote-preview-qa-conversation?sheetDebug=1`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.locator("[data-conversation-sheet]").first().waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(400);

  const coldPeek = await readSheetGeom(page);
  const coldH = coldPeek.sheetH;

  const box = await page.locator(".snap-sheet-handle").first().boundingBox();
  if (!box) throw new Error("no handle");
  const hx = box.x + box.width / 2;
  const hy = box.y + box.height / 2;

  const client = await page.context().newCDPSession(page);
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: hx, y: hy }],
  });
  let totalDy = 0;
  let slowStop = null;
  for (let step = 0; step < 90; step += 1) {
    totalDy -= 4;
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: hx, y: hy + totalDy }],
    });
    await page.waitForTimeout(32);
    const frame = await measureFrame(page);
    if (frame.phaseA >= 0.98 && slowStop === null) {
      slowStop = frame;
      break;
    }
  }
  await page.waitForTimeout(180);
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await waitSheetSettled(page);
  const afterSlow = await readSheetGeom(page);

  if (!slowStop) failures.push("slow pull never reached composer stop (phaseA≈1)");
  if (slowStop && slowStop.sheetH >= coldPeek.openH - 8) {
    failures.push(`slow stop at full height ${slowStop.sheetH}`);
  }
  if (afterSlow.snap !== "reply") failures.push(`slow pull settled to ${afterSlow.snap} not reply`);
  if (afterSlow.phaseA < 0.95) failures.push(`slow end phaseA ${afterSlow.phaseA}`);

  const replyH = afterSlow.sheetH;
  await cdpTouchDrag(page, hx, hy, hx, hy - (coldPeek.openH - replyH + 20), 48, 24);
  await waitSheetSettled(page);
  const full = await readSheetGeom(page);
  if (full.snap !== "full") failures.push(`full snap ${full.snap}`);
  const fullH = full.sheetH;

  const distinct =
    coldH > 0 &&
    replyH > coldH + 40 &&
    fullH > replyH + 40 &&
    fullH < coldPeek.openH + 4;
  if (!distinct) {
    failures.push(
      `detents not distinct cold=${coldH} reply=${replyH} full=${fullH} openH=${coldPeek.openH}`,
    );
  }

  for (let c = 0; c < 3; c += 1) {
    const opened = await readSheetGeom(page);
    const h = await page.locator(".snap-sheet-handle").first().boundingBox();
    const x = h.x + h.width / 2;
    const y = h.y + h.height / 2;
    if (opened.snap !== "full") {
      await cdpTouchDrag(page, x, y, x, y - (opened.openH - opened.sheetH + 24), 40, 24);
      await waitSheetSettled(page);
    }
    const atFull = await readSheetGeom(page);
    const closeDy = Math.round(atFull.sheetH - coldH + 56);
    const h2 = await page.locator(".snap-sheet-handle").first().boundingBox();
    await cdpTouchDrag(page, h2.x + h2.width / 2, h2.y + h2.height / 2, h2.x + h2.width / 2, h2.y + closeDy, 52, 26);
    await waitSheetSettled(page);
    const closed = await readSheetGeom(page);
    if (closed.sheetH !== coldH) {
      failures.push(`cycle ${c + 1} peek height ${closed.sheetH} != cold ${coldH}`);
    }
    if (closed.snap !== "peek") failures.push(`cycle ${c + 1} snap ${closed.snap}`);
  }

  await cdpTouchDrag(page, hx, hy, hx, hy - 140, 36, 28);
  await waitSheetSettled(page);
  const replyGeom = await readSheetGeom(page);
  const closeDy = Math.round(replyGeom.sheetH - coldH + 48);
  const handle = await page.locator(".snap-sheet-handle").first().boundingBox();
  const chx = handle.x + handle.width / 2;
  const chy = handle.y + handle.height / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: chx, y: chy }] });
  for (let i = 1; i <= 56; i += 1) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: chx, y: chy + (closeDy * i) / 56 }],
    });
    await page.waitForTimeout(28);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

  const releaseSamples = [];
  for (let f = 0; f < 20; f += 1) {
    releaseSamples.push(await measureFrame(page));
    await page.waitForTimeout(16);
  }
  let maxGapStep = 0;
  let maxCouplingDelta = 0;
  for (let i = 1; i < releaseSamples.length; i += 1) {
    const a = releaseSamples[i - 1];
    const b = releaseSamples[i];
    if (a.gap != null && b.gap != null) {
      maxGapStep = Math.max(maxGapStep, Math.abs(b.gap - a.gap));
    }
    if (
      a.threadTop != null &&
      b.threadTop != null &&
      a.composerTop != null &&
      b.composerTop != null
    ) {
      const threadMove = b.threadTop - a.threadTop;
      const composerMove = b.composerTop - a.composerTop;
      maxCouplingDelta = Math.max(maxCouplingDelta, Math.abs(threadMove - composerMove));
    }
  }
  const maxDelta = Math.max(maxGapStep, maxCouplingDelta);
  if (maxDelta > 2) failures.push(`release frame gap/coupling delta ${maxDelta}px > 2`);

  await waitSheetSettled(page);
  const endPeek = await readSheetGeom(page);
  if (endPeek.sheetH !== coldH) failures.push(`end peek ${endPeek.sheetH} != cold ${coldH}`);

  await browser.close();
  const result = { width, height, coldH, replyH, fullH, slowStop, maxDelta, failures };
  console.log(JSON.stringify(result, null, 2));
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
  console.log(`PASS round3 ${width}x${height}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
