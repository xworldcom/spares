#!/usr/bin/env node
/**
 * 2px CDP steps: sheet top, composer, thread track finger 1:1 in phase A.
 */
const { chromium } = require("playwright");
const { readSheetGeom, waitSheetSettled } = require("./gesture-lib.cjs");

const baseUrl = process.argv[2] || "http://127.0.0.1:3010";
const width = Number(process.argv[3] || 390);
const height = Number(process.argv[4] || 844);
const STEP_PX = 2;
const RATIO_MIN = 0.95;
const RATIO_MAX = 1.05;

async function seedQuote(page) {
  await page.request.post(`${baseUrl}/api/auth/login`, {
    data: { email: "staff@spares.local", password: "SparesStaff1!" },
  });
  await page.request.post(`${baseUrl}/api/staff/quotes/preview-fixture`);
  const quoteId = "quote-preview-qa-conversation";
  await page.request.patch(`${baseUrl}/api/quotes/${quoteId}/assistant`, { data: { paused: true } });
  for (let n = 1; n <= 2; n += 1) {
    await page.request.post(`${baseUrl}/api/quotes/${quoteId}/activity`, {
      data: { text: `Line ${n} for 1:1 drag.` },
    });
  }
}

function readEdges(page) {
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
      phaseA: Math.round(phaseA * 100) / 100,
      sheetTop: cardBox ? cardBox.top : null,
      composerTop: composerBox ? composerBox.top : null,
      threadBottom: lastBox ? lastBox.bottom : null,
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
      if (Number.isFinite(v) && v >= RATIO_MIN && v <= RATIO_MAX) bucket.push(v);
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
    samples.push({ fingerY: hy + dy, ...(await readEdges(page)) });
  }
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await waitSheetSettled(page);
  return samples;
}

async function run() {
  const failures = [];
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width, height }, isMobile: true, hasTouch: true });
  await seedQuote(page);
  await page.goto(`${baseUrl}/staff/quotes/quote-preview-qa-conversation?sheetDebug=1`, {
    waitUntil: "domcontentloaded",
  });
  await page.locator("[data-conversation-sheet]").waitFor();
  await page.waitForTimeout(400);

  const peek = await readSheetGeom(page);
  const box = await page.locator(".snap-sheet-handle").first().boundingBox();
  const hx = box.x + box.width / 2;
  const hy = box.y + box.height / 2;

  const upSamples = await slowCdpDrag(page, hx, hy, -200, STEP_PX, 28);
  const upRatios = sampleRatios(upSamples);
  const reply = await readSheetGeom(page);
  if (reply.phaseA < 0.9) failures.push(`not at composer stop phaseA=${reply.phaseA}`);

  const h2 = await page.locator(".snap-sheet-handle").first().boundingBox();
  const downSamples = await slowCdpDrag(
    page,
    h2.x + h2.width / 2,
    h2.y + h2.height / 2,
    reply.sheetH - peek.sheetH + 40,
    STEP_PX,
    28,
  );
  const downRatios = sampleRatios(downSamples);

  for (const [label, ratios] of [
    ["open sheetTop", upRatios.sheetTop],
    ["open composer", upRatios.composer],
    ["open thread", upRatios.thread],
    ["close sheetTop", downRatios.sheetTop],
    ["close composer", downRatios.composer],
    ["close thread", downRatios.thread],
  ]) {
    if (!ratioOk(ratios)) failures.push(`${label} not 1:1`);
  }

  await browser.close();
  console.log(JSON.stringify({ width, height, down: downRatios.composer.length, up: upRatios.composer.length, failures }, null, 2));
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
  console.log(`PASS drag-1to1 ${width}x${height}`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
