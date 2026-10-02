#!/usr/bin/env node
import { chromium, devices } from "playwright";
import { writeFileSync } from "node:fs";

const baseUrl = process.argv[2] || "http://127.0.0.1:3010";
const out = process.argv[3] || "/tmp/sheet-close-before.json";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  ...devices["iPhone 13"],
  viewport: { width: 390, height: 844 },
});
const page = await context.newPage();

const login = await page.request.post(`${baseUrl}/api/auth/login`, {
  data: { email: "staff@spares.local", password: "SparesStaff1!" },
});
if (!login.ok()) {
  console.error("login", login.status(), await login.text());
  process.exit(1);
}
const fixture = await page.request.post(`${baseUrl}/api/staff/quotes/preview-fixture`);
console.log("fixture", fixture.status());
const quoteId = "quote-preview-qa-conversation";
await page.request.patch(`${baseUrl}/api/quotes/${quoteId}/assistant`, {
  data: { paused: true },
});
for (let n = 1; n <= 8; n += 1) {
  const sent = await page.request.post(`${baseUrl}/api/quotes/${quoteId}/activity`, {
    data: { text: `History line ${n} sits above the latest bubble so close can clip it.` },
  });
  if (!sent.ok()) {
    console.error("seed", n, sent.status(), await sent.text());
    process.exit(1);
  }
}

await page.goto(`${baseUrl}/staff/quotes/quote-preview-qa-conversation?sheetDebug=1`, {
  waitUntil: "domcontentloaded",
  timeout: 60_000,
});
const sheet = page.locator("[data-conversation-sheet]").first();
await sheet.waitFor({ state: "visible", timeout: 30_000 });
await page.waitForTimeout(600);

async function readGeom() {
  return page.evaluate(() => {
    const card = document.querySelector("[data-conversation-sheet]");
    const thread = card?.querySelector(".imsg-thread");
    const composer = card?.querySelector(".imsg-composer");
    const rows = [...(thread?.querySelectorAll(":scope > li") ?? [])];
    const last = rows.at(-1);
    const phaseB = Number(getComputedStyle(card).getPropertyValue("--phase-b")) || 0;
    const phaseA = Number(getComputedStyle(card).getPropertyValue("--phase-a")) || 0;
    const threadBox = thread?.getBoundingClientRect();
    const composerBox = composer?.getBoundingClientRect();
    const lastBox = last?.getBoundingClientRect();
    const cardBox = card.getBoundingClientRect();
    const bubble = thread?.querySelector(".imsg-row:last-of-type .imsg-bubble");
    const bubbleBox = bubble?.getBoundingClientRect();
    const bubbleVis = bubbleBox && threadBox
      ? Math.round(Math.min(bubbleBox.bottom, threadBox.bottom) - Math.max(bubbleBox.top, threadBox.top))
      : 0;
    return {
      snap: card.getAttribute("data-snap"),
      classes: card.className,
      phaseA: Math.round(phaseA * 100) / 100,
      phaseB: Math.round(phaseB * 100) / 100,
      sheetTop: Math.round(cardBox.top),
      sheetBottom: Math.round(cardBox.bottom),
      sheetH: Math.round(cardBox.height),
      threadTop: threadBox ? Math.round(threadBox.top) : null,
      threadH: threadBox ? Math.round(threadBox.height) : null,
      threadBottom: threadBox ? Math.round(threadBox.bottom) : null,
      composerTop: composerBox ? Math.round(composerBox.top) : null,
      composerBottom: composerBox ? Math.round(composerBox.bottom) : null,
      composerH: composerBox ? Math.round(composerBox.height) : null,
      lastTop: lastBox ? Math.round(lastBox.top) : null,
      lastBottom: lastBox ? Math.round(lastBox.bottom) : null,
      gap: lastBox && composerBox ? Math.round(composerBox.top - lastBox.bottom) : null,
      bubbleVis,
      threadDock: card.getAttribute("data-thread-dock"),
    };
  });
}

async function waitSettled() {
  await page.waitForFunction(() => {
    const card = document.querySelector("[data-conversation-sheet]");
    return card && !card.classList.contains("is-settling") && !card.classList.contains("is-dragging");
  }, { timeout: 5000 });
  await page.waitForTimeout(80);
}

async function dragHandle(dy, steps) {
  const handle = page.locator(".snap-sheet-handle").first();
  const box = await handle.boundingBox();
  if (!box) throw new Error("no handle");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(x, y + (dy * i) / steps, { steps: 1 });
    await page.waitForTimeout(16);
  }
  const mid = await readGeom();
  await page.mouse.up();
  await waitSettled();
  return mid;
}

const openRest = await readGeom();
console.log("start", JSON.stringify(openRest));
let guard = 0;
let openMid = null;
while ((await readGeom()).snap !== "full" && guard < 4) {
  openMid = await dragHandle(-640, 32);
  console.log("up mid", JSON.stringify(openMid));
  console.log("up rest", JSON.stringify(await readGeom()));
  guard += 1;
}
if ((await readGeom()).snap !== "full") {
  console.error("never reached full");
  await page.screenshot({ path: "/tmp/sheet-not-full.png" });
  process.exit(2);
}

const handle = page.locator(".snap-sheet-handle").first();
const box = await handle.boundingBox();
const x = box.x + box.width / 2;
const y = box.y + box.height / 2;
const samples = [];
await page.mouse.move(x, y);
await page.mouse.down();
const steps = 48;
let shotB = false;
let shotA = false;
for (let i = 1; i <= steps; i += 1) {
  await page.mouse.move(x, y + i * 14, { steps: 1 });
  await page.waitForTimeout(30);
  if (i % 2 === 0) {
    const sample = await readGeom();
    samples.push(sample);
    if (!shotB && sample.phaseB < 0.55 && sample.phaseB > 0.2) {
      shotB = true;
      await page.screenshot({ path: "/tmp/sheet-close-phase-b.png" });
    }
    if (!shotA && sample.phaseB === 0 && sample.phaseA < 0.7 && sample.phaseA > 0.05) {
      shotA = true;
      await page.screenshot({ path: "/tmp/sheet-close-phase-a.png" });
    }
  }
}
await page.mouse.up();
await page.waitForTimeout(700);
const released = await readGeom();
samples.push({ ...released, released: true });

const summary = samples.map((s) =>
  `b=${s.phaseB} a=${s.phaseA} sheetH=${s.sheetH} threadTop=${s.threadTop} threadH=${s.threadH} lastTop=${s.lastTop} gap=${s.gap} composerTop=${s.composerTop} snap=${s.snap}`,
);
console.log(summary.join("\n"));
writeFileSync(out, JSON.stringify({ samples }, null, 2));
await page.screenshot({ path: "/tmp/sheet-close-mid.png" });

const phaseB = samples.filter((s) => s.phaseB > 0.12 && s.phaseB < 0.95 && !s.released);
const phaseA = samples.filter((s) => s.phaseB === 0 && s.phaseA < 1 && s.phaseA > 0);
const failures = [];
if (
  !openMid ||
  openMid.threadDock !== "composer" ||
  openMid.gap == null ||
  openMid.gap > 40 ||
  !(openMid.phaseB > 0.5) ||
  !(openMid.sheetH > 400)
) {
  failures.push(`open slide left the latest row: ${JSON.stringify(openMid)}`);
}
if (phaseB.length < 4) {
  failures.push("close drag did not cross phase B");
}
for (let i = 0; i < phaseB.length; i += 1) {
  const s = phaseB[i];
  if (s.composerBottom > s.sheetBottom + 2 || s.composerTop < s.sheetTop) {
    failures.push(`composer left the sheet at phaseB ${s.phaseB}`);
  }
  if (s.threadDock !== "composer") failures.push(`thread not docked at phaseB ${s.phaseB}`);
  if (s.bubbleVis < 16) failures.push(`latest bubble left the window at phaseB ${s.phaseB}: vis ${s.bubbleVis}`);
  if (s.gap == null || s.gap > 40) {
    failures.push(`latest row left the composer at phaseB ${s.phaseB}: gap ${s.gap}`);
  }
  if (s.threadBottom != null && Math.abs(s.threadBottom - s.composerTop) > 8) {
    failures.push(`thread split from composer at phaseB ${s.phaseB}: ${s.threadBottom} vs ${s.composerTop}`);
  }
  if (i === 0) continue;
  const prev = phaseB[i - 1];
  const dH = prev.sheetH - s.sheetH;
  const dTop = s.sheetTop - prev.sheetTop;
  if (dH < 4) failures.push(`shell stalled at phaseB ${s.phaseB}: ${prev.sheetH} -> ${s.sheetH}`);
  if (Math.abs(dTop - dH) > 3) failures.push(`shell top did not track height at phaseB ${s.phaseB}`);
  if (dH > 48) failures.push(`shell jumped ${dH}px at phaseB ${s.phaseB}`);
}
if (phaseA.length < 2) failures.push("phase A samples missing");
for (const s of phaseA) {
  if (s.threadDock !== "composer") {
    failures.push(`phase A left the thread at phaseA ${s.phaseA}`);
  }
  if (s.gap == null || s.gap > 40) {
    failures.push(`phase A peeled the latest row off the composer at phaseA ${s.phaseA}: gap ${s.gap}`);
  }
}
for (let i = 1; i < phaseA.length; i += 1) {
  if (phaseA[i].sheetH > phaseA[i - 1].sheetH + 2) {
    failures.push(`phase A shell grew: ${phaseA[i - 1].sheetH} -> ${phaseA[i].sheetH}`);
  }
}
const peek = samples.at(-1);
if (!peek || peek.phaseA !== 0 || peek.sheetH > 120) {
  failures.push(`did not finish at peek: ${JSON.stringify(peek)}`);
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("PASS shell tracks the finger, latest row stays on the composer through close and open");
await browser.close();
