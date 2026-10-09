#!/usr/bin/env node
/**
 * 2px CDP steps: composer top and thread bottom track finger 1:1 during live drag
 * (composer-stop → closed and reverse). Ratio must be 1.00 ± 0.05.
 *
 * Usage: node scripts/care-notes-chunk2/e2e-phone-sheet-drag-1to1.cjs <baseUrl> <w> <h>
 */
const { chromium } = require("playwright");
const { readSheetGeom, waitSheetSettled, cdpTouchDrag } = require("./gesture-lib.cjs");

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
    const lastBox = last?.getBoundingClientRect();
    const composerBox = composer?.getBoundingClientRect();
    const phaseA = Number(getComputedStyle(card).getPropertyValue("--phase-a")) || 0;
    return {
      phaseA: Math.round(phaseA * 100) / 100,
      composerTop: composerBox ? composerBox.top : null,
      threadBottom: lastBox ? lastBox.bottom : null,
      dragging: card?.classList.contains("is-dragging"),
      motionLive: card?.hasAttribute("data-motion-live"),
    };
  });
}

function sampleRatios(samples) {
  const ratios = { composer: [], thread: [] };
  for (let i = 1; i < samples.length; i += 1) {
    const a = samples[i - 1];
    const b = samples[i];
    const dFinger = b.fingerY - a.fingerY;
    if (Math.abs(dFinger) < 0.5) continue;
    if (a.composerTop != null && b.composerTop != null) {
      ratios.composer.push((b.composerTop - a.composerTop) / dFinger);
    }
    if (a.threadBottom != null && b.threadBottom != null) {
      ratios.thread.push((b.threadBottom - a.threadBottom) / dFinger);
    }
  }
  return ratios;
}

function ratioOk(list) {
  if (list.length < 8) return false;
  const trimmed = list.filter((r) => Number.isFinite(r) && Math.abs(r) > 0.02);
  if (trimmed.length < 8) return false;
  const bad = trimmed.filter((r) => r < RATIO_MIN || r > RATIO_MAX);
  return bad.length === 0;
}

async function dragSteps(page, startX, startY, steps, direction) {
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  const samples = [];
  for (let i = 0; i <= steps; i += 1) {
    const fingerY = startY + direction * STEP_PX * i;
    await page.mouse.move(startX, fingerY, { steps: 1 });
    await page.waitForTimeout(20);
    const edges = await readEdges(page);
    samples.push({ fingerY, ...edges });
  }
  await page.mouse.up();
  await waitSheetSettled(page);
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
  await seedQuote(page);
  await page.goto(`${baseUrl}/staff/quotes/quote-preview-qa-conversation?sheetDebug=1`, {
    waitUntil: "domcontentloaded",
  });
  await page.locator("[data-conversation-sheet]").waitFor({ state: "visible" });
  await page.waitForTimeout(400);

  const peek = await readSheetGeom(page);
  const box = await page.locator(".snap-sheet-handle").first().boundingBox();
  const hx = box.x + box.width / 2;
  const hy = box.y + box.height / 2;
  const targetReply = Math.min(peek.openH - 48, peek.sheetH + 140);
  const openDy = -(targetReply - peek.sheetH);
  await cdpTouchDrag(page, hx, hy, hx, hy + openDy, 36, 24);
  await waitSheetSettled(page);
  const reply = await readSheetGeom(page);
  if (reply.phaseA < 0.9) failures.push(`not at composer stop phaseA=${reply.phaseA}`);

  const closeSteps = Math.min(120, Math.ceil((reply.sheetH - peek.sheetH) / STEP_PX) + 4);
  const downSamples = await dragSteps(page, hx, hy, closeSteps, 1);
  const downInPhaseA = downSamples.filter(
    (s) => s.phaseA > 0.08 && s.phaseA < 0.98 && (s.dragging || s.motionLive),
  );
  const downRatios = sampleRatios(downInPhaseA.length > 10 ? downInPhaseA : downSamples);
  if (!ratioOk(downRatios.composer)) {
    failures.push(`close d(composer)/d(finger) out of band (${downRatios.composer.slice(0, 5).join(",")}…)`);
  }
  if (!ratioOk(downRatios.thread)) {
    failures.push(`close d(thread)/d(finger) out of band (${downRatios.thread.slice(0, 5).join(",")}…)`);
  }

  const box2 = await page.locator(".snap-sheet-handle").first().boundingBox();
  const hx2 = box2.x + box2.width / 2;
  const hy2 = box2.y + box2.height / 2;
  const openSteps = Math.min(120, Math.ceil((reply.sheetH - peek.sheetH) / STEP_PX) + 4);
  const upSamples = await dragSteps(page, hx2, hy2, openSteps, -1);
  const upInPhaseA = upSamples.filter(
    (s) => s.phaseA > 0.08 && s.phaseA < 0.98 && (s.dragging || s.motionLive),
  );
  const upRatios = sampleRatios(upInPhaseA.length > 10 ? upInPhaseA : upSamples);
  if (!ratioOk(upRatios.composer)) {
    failures.push(`open d(composer)/d(finger) out of band`);
  }
  if (!ratioOk(upRatios.thread)) {
    failures.push(`open d(thread)/d(finger) out of band`);
  }

  await browser.close();
  console.log(
    JSON.stringify(
      {
        width,
        height,
        down: { n: downRatios.composer.length, composer: downRatios.composer.slice(0, 6) },
        up: { n: upRatios.composer.length, composer: upRatios.composer.slice(0, 6) },
        failures,
      },
      null,
      2,
    ),
  );
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
