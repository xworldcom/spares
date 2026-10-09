#!/usr/bin/env node
/**
 * Every frame from finger-up through settle: no element jumps >4px in one frame.
 * Peek height identical to cold open after 3 open/close cycles.
 */
const { chromium } = require("playwright");
const { cdpTouchDrag, readSheetGeom, waitSheetSettled } = require("./gesture-lib.cjs");

const baseUrl = process.argv[2] || "http://127.0.0.1:3010";
const width = Number(process.argv[3] || 390);
const height = Number(process.argv[4] || 844);
const MAX_FRAME_JUMP_PX = 4;

async function seedQuote(page) {
  await page.request.post(`${baseUrl}/api/auth/login`, {
    data: { email: "staff@spares.local", password: "SparesStaff1!" },
  });
  await page.request.post(`${baseUrl}/api/staff/quotes/preview-fixture`);
  const quoteId = "quote-preview-qa-conversation";
  await page.request.patch(`${baseUrl}/api/quotes/${quoteId}/assistant`, { data: { paused: true } });
  for (let n = 1; n <= 2; n += 1) {
    await page.request.post(`${baseUrl}/api/quotes/${quoteId}/activity`, {
      data: { text: `Line ${n} release frames.` },
    });
  }
}

function readFrame(page) {
  return page.evaluate(() => {
    const card = document.querySelector("[data-conversation-sheet]");
    const thread = card?.querySelector(".imsg-thread");
    const composer = card?.querySelector(".imsg-composer");
    const rows = [...(thread?.querySelectorAll(":scope > li") ?? [])];
    const last = rows.at(-1);
    const cardBox = card?.getBoundingClientRect();
    const composerBox = composer?.getBoundingClientRect();
    const lastBox = last?.getBoundingClientRect();
    const threadBox = thread?.getBoundingClientRect();
    return {
      sheetH: cardBox ? Math.round(cardBox.height) : null,
      composerTop: composerBox ? Math.round(composerBox.top) : null,
      threadBottom: lastBox ? Math.round(lastBox.bottom) : null,
      threadTop: threadBox ? Math.round(threadBox.top) : null,
      settling: card?.classList.contains("is-settling"),
    };
  });
}

function maxJump(frames) {
  let worst = { key: "", delta: 0, i: 0 };
  const keys = ["sheetH", "composerTop", "threadBottom", "threadTop"];
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
  const coldH = (await readSheetGeom(page)).sheetH;

  for (let c = 0; c < 3; c += 1) {
    const peekNow = await readSheetGeom(page);
    const box = await page.locator(".snap-sheet-handle").first().boundingBox();
    const hx = box.x + box.width / 2;
    const hy = box.y + box.height / 2;
    await cdpTouchDrag(page, hx, hy, hx, hy - 150, 32, 22);
    await waitSheetSettled(page);
    const replyNow = await readSheetGeom(page);
    const closeDy = Math.round(replyNow.sheetH - peekNow.sheetH + 56);
    const h2 = await page.locator(".snap-sheet-handle").first().boundingBox();
    await cdpTouchDrag(page, h2.x + h2.width / 2, h2.y + h2.height / 2, h2.x + h2.width / 2, h2.y + closeDy, 48, 26);
    await waitSheetSettled(page);
    const closed = await readSheetGeom(page);
    if (closed.sheetH !== coldH) failures.push(`cycle ${c + 1} peek ${closed.sheetH} != cold ${coldH}`);
    if (closed.snap !== "peek") failures.push(`cycle ${c + 1} snap ${closed.snap}`);
  }

  const peekGeom = await readSheetGeom(page);
  const openBox = await page.locator(".snap-sheet-handle").first().boundingBox();
  await cdpTouchDrag(page, openBox.x + openBox.width / 2, openBox.y + openBox.height / 2, openBox.x + openBox.width / 2, openBox.y - 140, 36, 24);
  await waitSheetSettled(page);
  const replyGeom = await readSheetGeom(page);
  const handle = await page.locator(".snap-sheet-handle").first().boundingBox();
  const chx = handle.x + handle.width / 2;
  const chy = handle.y + handle.height / 2;
  const closeDy = Math.round(replyGeom.sheetH - peekGeom.sheetH + 48);
  const client = await page.context().newCDPSession(page);
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: chx, y: chy }] });
  for (let i = 1; i <= 40; i += 1) {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: chx, y: chy + (closeDy * i) / 40 }],
    });
    await page.waitForTimeout(20);
  }
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForFunction(() => {
    const card = document.querySelector("[data-conversation-sheet]");
    return card && !card.classList.contains("is-dragging");
  });

  const frames = [];
  for (let f = 0; f < 40; f += 1) {
    frames.push(await readFrame(page));
    await page.waitForTimeout(16);
  }
  await waitSheetSettled(page);
  const worst = maxJump(frames);
  if (worst.delta > MAX_FRAME_JUMP_PX) {
    failures.push(`release jump ${worst.delta}px on ${worst.key} frame ${worst.i}`);
  }
  console.log(JSON.stringify({ width, height, coldH, worst, frameCount: frames.length, failures }, null, 2));
  await browser.close();
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
  console.log(`PASS release-frames ${width}x${height}`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
