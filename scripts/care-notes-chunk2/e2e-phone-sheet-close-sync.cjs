#!/usr/bin/env node
/**
 * Frame-by-frame gap between last bubble bottom and composer top while slowly closing
 * reply → peek. Fails if gap grows during phase-A collapse (composer leads thread).
 *
 * Usage: node scripts/care-notes-chunk2/e2e-phone-sheet-close-sync.cjs <baseUrl> <w> <h>
 */
const { chromium } = require("playwright");
const { cdpTouchDrag, readSheetGeom, waitSheetSettled } = require("./gesture-lib.cjs");

const baseUrl = process.argv[2] || "http://127.0.0.1:3010";
const width = Number(process.argv[3] || 390);
const height = Number(process.argv[4] || 844);

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
  for (let n = 1; n <= 8; n += 1) {
    const sent = await page.request.post(`${baseUrl}/api/quotes/${quoteId}/activity`, {
      data: { text: `History line ${n} for chunk2 close sync.` },
    });
    if (!sent.ok()) throw new Error(`seed ${n} ${sent.status()}`);
  }
}

function measureGap(page) {
  return page.evaluate(() => {
    const card = document.querySelector("[data-conversation-sheet]");
    const thread = card?.querySelector(".imsg-thread");
    const composer = card?.querySelector(".imsg-composer");
    const rows = [...(thread?.querySelectorAll(":scope > li") ?? [])];
    const last = rows.at(-1);
    const lastBox = last?.getBoundingClientRect();
    const composerBox = composer?.getBoundingClientRect();
    const phaseA = Number(getComputedStyle(card).getPropertyValue("--phase-a")) || 0;
    const gap =
      lastBox && composerBox ? Math.round(composerBox.top - lastBox.bottom) : null;
    return { gap, phaseA: Math.round(phaseA * 100) / 100, snap: card?.getAttribute("data-snap") };
  });
}

async function run() {
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

  const box = await page.locator(".snap-sheet-handle").first().boundingBox();
  if (!box) throw new Error("no handle");
  const hx = box.x + box.width / 2;
  const hy = box.y + box.height / 2;

  const peekGeom = await readSheetGeom(page);
  const targetReply = Math.min(
    peekGeom.openH - 48,
    Math.round(peekGeom.sheetH + Math.max(110, (peekGeom.openH - peekGeom.sheetH) * 0.28)),
  );
  const replyDy = -(targetReply - peekGeom.sheetH);
  await cdpTouchDrag(page, hx, hy, hx, hy + replyDy, 40, 28);
  await waitSheetSettled(page);
  const reply = await readSheetGeom(page);
  if (reply.snap !== "reply" && reply.snap !== "full") {
    throw new Error(`unexpected snap after open ${reply.snap}`);
  }
  if (reply.phaseA < 0.9) throw new Error(`expected reply phaseA, got ${reply.phaseA} snap=${reply.snap}`);

  const closeDy = Math.round(reply.sheetH - peekGeom.sheetH + 48);
  const handleBox = await page.locator(".snap-sheet-handle").first().boundingBox();
  if (!handleBox) throw new Error("no handle after open");
  const chx = handleBox.x + handleBox.width / 2;
  const chy = handleBox.y + handleBox.height / 2;
  const client = await page.context().newCDPSession(page);
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: chx, y: chy }],
  });

  const samples = [];
  const steps = 72;
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const y = chy + closeDy * t;
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: hx, y }],
    });
    await page.waitForTimeout(36);
    const sample = await measureGap(page);
    samples.push(sample);
  }
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await waitSheetSettled(page);

  const failures = [];
  const inPhaseA = samples.filter((s) => s.phaseA > 0.08 && s.phaseA < 0.92 && s.gap != null);
  if (inPhaseA.length < 6) {
    failures.push(`too few phase-A samples (${inPhaseA.length})`);
  }
  let maxGap = -Infinity;
  let maxGapSample = null;
  for (const s of inPhaseA) {
    if (s.gap == null) continue;
    if (s.gap > maxGap) {
      maxGap = s.gap;
      maxGapSample = s;
    }
    if (s.gap > 28) {
      failures.push(`gap ${s.gap}px at phaseA=${s.phaseA} snap=${s.snap}`);
    }
  }
  const end = await readSheetGeom(page);
  if (end.snap !== "peek") failures.push(`end snap ${end.snap}`);
  if (end.snap !== "peek" || end.phaseA !== 0) failures.push(`bad end state ${JSON.stringify(end)}`);

  await browser.close();
  const result = { width, height, maxGap, maxGapSample, sampleCount: samples.length, failures };
  console.log(JSON.stringify(result, null, 2));
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
  console.log(`PASS close-sync ${width}x${height} maxGap=${maxGap}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
