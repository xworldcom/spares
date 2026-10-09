#!/usr/bin/env node
/**
 * Chunk 2 — slow CDP touch drag closed → intermediate → open → reverse.
 * Usage: node scripts/care-notes-chunk2/e2e-phone-sheet-detents.cjs <baseUrl> <width> <height>
 */
const { chromium } = require("playwright");
const { cdpTouchDrag, waitSheetSettled, readSheetGeom } = require("./gesture-lib.cjs");

const baseUrl = process.argv[2] || "http://127.0.0.1:3010";
const width = Number(process.argv[3] || 390);
const height = Number(process.argv[4] || 844);

async function seedQuote(page) {
  const login = await page.request.post(`${baseUrl}/api/auth/login`, {
    data: { email: "staff@spares.local", password: "SparesStaff1!" },
  });
  if (!login.ok()) {
    throw new Error(`login ${login.status()}`);
  }
  await page.request.post(`${baseUrl}/api/staff/quotes/preview-fixture`);
  const quoteId = "quote-preview-qa-conversation";
  await page.request.patch(`${baseUrl}/api/quotes/${quoteId}/assistant`, {
    data: { paused: true },
  });
  for (let n = 1; n <= 8; n += 1) {
    const sent = await page.request.post(`${baseUrl}/api/quotes/${quoteId}/activity`, {
      data: { text: `History line ${n} for chunk2 detent drag.` },
    });
    if (!sent.ok()) {
      throw new Error(`seed ${n} ${sent.status()}`);
    }
  }
}

async function runViewport() {
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
  await page.waitForTimeout(500);

  const failures = [];
  const peek = await readSheetGeom(page);
  if (peek.snap !== "peek") failures.push(`start snap ${peek.snap}`);
  if (peek.phaseA !== 0) failures.push(`start phaseA ${peek.phaseA}`);
  if (peek.composerBelowTab !== true) failures.push(`composer not below tab at peek: ${JSON.stringify(peek)}`);

  async function dragHandle(dy, steps) {
    const box = await page.locator(".snap-sheet-handle").first().boundingBox();
    if (!box) throw new Error("no handle");
    const hx = box.x + box.width / 2;
    const hy = box.y + box.height / 2;
    await cdpTouchDrag(page, hx, hy, hx, hy + dy, steps, 28);
    await waitSheetSettled(page);
  }

  const peekGeom = await readSheetGeom(page);
  const targetReply = Math.min(
    peekGeom.openH - 48,
    Math.round(peekGeom.sheetH + Math.max(110, (peekGeom.openH - peekGeom.sheetH) * 0.28)),
  );
  const replyDy = -(targetReply - peekGeom.sheetH);
  await dragHandle(replyDy, 40);
  const reply = await readSheetGeom(page);
  if (reply.snap !== "reply" && reply.snap !== "full") failures.push(`reply snap ${reply.snap}`);
  if (reply.snap === "full" && reply.sheetH < reply.openH - 8) {
    failures.push(`unexpected full before max open ${reply.sheetH}`);
  }
  if (reply.snap === "reply" || reply.snap === "full") {
    if (reply.phaseA < 0.95) failures.push(`reply phaseA ${reply.phaseA}`);
  }
  if (reply.composerBelowTab === true) failures.push(`composer still below tab at reply`);
  if (reply.gap != null && reply.gap > 48) failures.push(`reply gap ${reply.gap}`);

  await dragHandle(-380, 48);
  const full = await readSheetGeom(page);
  if (full.snap !== "full") failures.push(`full snap ${full.snap}`);
  if (full.phaseB < 0.95) failures.push(`full phaseB ${full.phaseB}`);
  if (full.sheetH < full.openH - 40) failures.push(`full height ${full.sheetH} vs open ${full.openH}`);

  await dragHandle(680, 56);
  const backPeek = await readSheetGeom(page);
  if (backPeek.snap !== "peek") failures.push(`close snap ${backPeek.snap}`);
  if (backPeek.phaseA !== 0) failures.push(`close phaseA ${backPeek.phaseA}`);
  // Resting peek after a drag cycle can differ from cold-open tab clearance; shell-close-probe covers motion.
  if (backPeek.gap != null && backPeek.gap > 84) failures.push(`peek gap too large after close: ${backPeek.gap}`);

  await browser.close();
  return { width, height, failures, peek, reply, full, backPeek };
}

runViewport()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    if (result.failures.length) {
      console.error(result.failures.join("\n"));
      process.exit(1);
    }
    console.log(`PASS ${width}x${height}`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
