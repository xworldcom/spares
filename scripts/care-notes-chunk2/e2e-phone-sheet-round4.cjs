#!/usr/bin/env node
/**
 * Round 4 — single motion scalar H: sheet top, thread, composer share finger delta;
 * slow CDP composer stop; fast flick release ≤4px; short thread @390.
 */
const { chromium } = require("playwright");
const { cdpTouchDrag, readSheetGeom, waitSheetSettled } = require("./gesture-lib.cjs");

const baseUrl = process.argv[2] || "http://127.0.0.1:3010";
const width = Number(process.argv[3] || 390);
const height = Number(process.argv[4] || 844);
const STEP_PX = 2;
const RATIO_MIN = 0.95;
const RATIO_MAX = 1.05;
const MAX_FRAME_JUMP_PX = 4;

async function loginAndFixture(page, messageCount) {
  await page.request.post(`${baseUrl}/api/auth/login`, {
    data: { email: "staff@spares.local", password: "SparesStaff1!" },
  });
  await page.request.post(`${baseUrl}/api/staff/quotes/preview-fixture`);
  const quoteId = "quote-preview-qa-conversation";
  await page.request.patch(`${baseUrl}/api/quotes/${quoteId}/assistant`, { data: { paused: true } });
  for (let n = 1; n <= messageCount; n += 1) {
    await page.request.post(`${baseUrl}/api/quotes/${quoteId}/activity`, {
      data: { text: n === 1 ? "Short thread only." : `Line ${n} round4.` },
    });
  }
}

function measureFrame(page) {
  return page.evaluate(() => {
    const card = document.querySelector("[data-conversation-sheet]");
    const thread = card?.querySelector(".imsg-thread");
    const composer = card?.querySelector(".imsg-composer");
    const rows = [...(thread?.querySelectorAll(":scope > li") ?? [])];
    const last = rows.at(-1);
    const cardBox = card?.getBoundingClientRect();
    const composerBox = composer?.getBoundingClientRect();
    const lastBox = last?.getBoundingClientRect();
    const phaseA = Number(getComputedStyle(card).getPropertyValue("--phase-a")) || 0;
    return {
      snap: card?.getAttribute("data-snap"),
      phaseA: Math.round(phaseA * 100) / 100,
      sheetTop: cardBox ? Math.round(cardBox.top) : null,
      sheetH: cardBox ? Math.round(cardBox.height) : null,
      threadBottom: lastBox ? Math.round(lastBox.bottom) : null,
      composerTop: composerBox ? Math.round(composerBox.top) : null,
      dragging: card?.classList.contains("is-dragging"),
      motionLive: card?.hasAttribute("data-motion-live"),
    };
  });
}

function sampleRatios(samples) {
  const ratios = { sheetTop: [], composer: [], thread: [] };
  for (let i = 1; i < samples.length; i += 1) {
    const a = samples[i - 1];
    const b = samples[i];
    const dFinger = b.fingerY - a.fingerY;
    if (Math.abs(dFinger) < 0.5) continue;
    if (
      a.phaseA <= 0.06 ||
      b.phaseA <= 0.06 ||
      a.phaseA >= 0.99 ||
      b.phaseA >= 0.99 ||
      (!a.dragging && !a.motionLive) ||
      (!b.dragging && !b.motionLive)
    ) {
      continue;
    }
    const push = (bucket, v) => {
      if (Number.isFinite(v) && Math.abs(v) >= RATIO_MIN && Math.abs(v) <= RATIO_MAX) bucket.push(v);
    };
    if (a.sheetTop != null && b.sheetTop != null) push(ratios.sheetTop, (b.sheetTop - a.sheetTop) / dFinger);
    if (a.composerTop != null && b.composerTop != null) {
      push(ratios.composer, (b.composerTop - a.composerTop) / dFinger);
    }
    if (a.threadBottom != null && b.threadBottom != null) {
      push(ratios.thread, (b.threadBottom - a.threadBottom) / dFinger);
    }
  }
  return ratios;
}

function ratioOk(list) {
  return list.length >= 8;
}

function maxJump(frames) {
  let worst = { key: "", delta: 0, i: 0 };
  const keys = ["sheetH", "sheetTop", "composerTop", "threadBottom"];
  for (let i = 1; i < frames.length; i += 1) {
    for (const key of keys) {
      const a = frames[i - 1][key];
      const b = frames[i][key];
      if (a == null || b == null) continue;
      const d = Math.abs(b - a);
      if (d > worst.delta) worst = { key, delta: d, i };
    }
  }
  return worst;
}

async function slowCdpDrag(page, hx, hy, totalDy, stepPx, pauseMs) {
  const client = await page.context().newCDPSession(page);
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: hx, y: hy }] });
  const samples = [];
  let dy = 0;
  const steps = Math.ceil(Math.abs(totalDy) / stepPx);
  for (let i = 0; i < steps; i += 1) {
    dy += totalDy > 0 ? stepPx : -stepPx;
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: hx, y: hy + dy }],
    });
    await page.waitForTimeout(pauseMs);
    samples.push({ fingerY: hy + dy, ...(await measureFrame(page)) });
  }
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  return samples;
}

async function run() {
  const failures = [];
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width, height },
    isMobile: true,
    hasTouch: true,
  });
  const shortThread = width === 390;
  await loginAndFixture(page, shortThread ? 1 : 2);
  await page.goto(`${baseUrl}/staff/quotes/quote-preview-qa-conversation?sheetDebug=1`, {
    waitUntil: "domcontentloaded",
  });
  await page.locator("[data-conversation-sheet]").waitFor();
  await page.waitForTimeout(400);

  const coldPeek = await readSheetGeom(page);
  const box = await page.locator(".snap-sheet-handle").first().boundingBox();
  const hx = box.x + box.width / 2;
  const hy = box.y + box.height / 2;

  const slowUp = await slowCdpDrag(page, hx, hy, -220, STEP_PX, 32);
  let slowStop = null;
  for (const frame of slowUp) {
    if (frame.phaseA >= 0.98 && slowStop === null) slowStop = frame;
  }
  await waitSheetSettled(page);
  if (!slowStop) failures.push("slow drag never hit composer stop");
  if (slowStop && slowStop.sheetH >= coldPeek.openH - 8) {
    failures.push(`composer stop at full height ${slowStop.sheetH}`);
  }

  const ratios = sampleRatios(slowUp);
  if (!ratioOk(ratios.sheetTop)) failures.push("sheet top not 1:1");
  if (!ratioOk(ratios.composer)) failures.push("composer not 1:1");
  if (!ratioOk(ratios.thread)) failures.push("thread not 1:1");

  const replyGeom = await readSheetGeom(page);
  const h2 = await page.locator(".snap-sheet-handle").first().boundingBox();
  const closeDy = Math.round(replyGeom.sheetH - coldPeek.sheetH + 48);
  const flickClient = await page.context().newCDPSession(page);
  const fhx = h2.x + h2.width / 2;
  const fhy = h2.y + h2.height / 2;
  await flickClient.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: fhx, y: fhy }] });
  for (let i = 1; i <= 8; i += 1) {
    await flickClient.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: fhx, y: fhy + (closeDy * i) / 8 }],
    });
    await page.waitForTimeout(12);
  }
  await flickClient.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForFunction(() => {
    const card = document.querySelector("[data-conversation-sheet]");
    return card && !card.classList.contains("is-dragging");
  });
  const flickFrames = [];
  for (let f = 0; f < 35; f += 1) {
    flickFrames.push(await measureFrame(page));
    await page.waitForTimeout(16);
  }
  await waitSheetSettled(page);
  const flickWorst = maxJump(flickFrames);
  if (flickWorst.delta > MAX_FRAME_JUMP_PX) {
    failures.push(`release jump ${flickWorst.delta}px on ${flickWorst.key}`);
  }
  const afterPeek = await readSheetGeom(page);
  if (afterPeek.sheetH !== coldPeek.sheetH) failures.push(`peek height drift ${afterPeek.sheetH}`);
  if (shortThread) {
    await cdpTouchDrag(page, hx, hy, hx, hy - (coldPeek.openH - coldPeek.sheetH - 24), 40, 28);
    await waitSheetSettled(page);
    const full = await readSheetGeom(page);
    if (full.snap !== "full") failures.push(`short thread snap ${full.snap}`);
  }

  await browser.close();
  console.log(JSON.stringify({ width, height, slowStop, flickWorst, failures }, null, 2));
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
  console.log(`PASS round4 ${width}x${height}`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
