#!/usr/bin/env node
/**
 * Slow full-to-peek drag on the quote conversation sheet.
 * Fails if the latest bubble leaves the composer during phase B, the shell
 * leaves full height, or phase A stops shrinking the sheet.
 *
 * node .cursor/skills/verify-oee360/scripts/sheet-close-probe.mjs http://127.0.0.1:3010
 */
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
    const bubbles = [...(thread?.querySelectorAll(".imsg-bubble, .imsg-chip, .imsg-row") ?? [])];
    const last = bubbles.at(-1);
    const phaseB = Number(getComputedStyle(card).getPropertyValue("--phase-b")) || 0;
    const phaseA = Number(getComputedStyle(card).getPropertyValue("--phase-a")) || 0;
    const threadBox = thread?.getBoundingClientRect();
    const composerBox = composer?.getBoundingClientRect();
    const lastBox = last?.getBoundingClientRect();
    const cardBox = card.getBoundingClientRect();
    return {
      snap: card.getAttribute("data-snap"),
      classes: card.className,
      phaseA: Math.round(phaseA * 100) / 100,
      phaseB: Math.round(phaseB * 100) / 100,
      sheetTop: Math.round(cardBox.top),
      sheetH: Math.round(cardBox.height),
      threadTop: threadBox ? Math.round(threadBox.top) : null,
      threadH: threadBox ? Math.round(threadBox.height) : null,
      threadBottom: threadBox ? Math.round(threadBox.bottom) : null,
      composerTop: composerBox ? Math.round(composerBox.top) : null,
      composerH: composerBox ? Math.round(composerBox.height) : null,
      lastTop: lastBox ? Math.round(lastBox.top) : null,
      lastBottom: lastBox ? Math.round(lastBox.bottom) : null,
      gap: lastBox && composerBox ? Math.round(composerBox.top - lastBox.bottom) : null,
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

const fullH = samples.find((s) => s.phaseB > 0.9)?.sheetH;
const phaseB = samples.filter((s) => s.phaseB > 0.12 && s.phaseB < 0.95 && !s.released);
const phaseA = samples.filter((s) => s.phaseB === 0 && s.phaseA < 1 && s.phaseA > 0);
const failures = [];
if (!openMid || openMid.threadDock != null || !(openMid.phaseB > 0.5) || !(openMid.sheetH > 400)) {
  failures.push(`open slide changed: ${JSON.stringify(openMid)}`);
}
if (!fullH || phaseB.length < 4) {
  failures.push("close drag did not cross phase B");
}
const gap0 = phaseB[0]?.gap;
const last0 = phaseB[0]?.lastTop;
const composer0 = phaseB[0]?.composerTop;
for (let i = 0; i < phaseB.length; i += 1) {
  const s = phaseB[i];
  if (Math.abs(s.gap - gap0) > 8) failures.push(`gap drifted at phaseB ${s.phaseB}: ${s.gap} vs ${gap0}`);
  if (Math.abs(s.lastTop - last0) > 8) failures.push(`latest bubble moved at phaseB ${s.phaseB}: ${s.lastTop} vs ${last0}`);
  if (Math.abs(s.composerTop - composer0) > 4) failures.push(`composer moved during phase B ${s.phaseB}: ${s.composerTop}`);
  if (Math.abs(s.sheetH - fullH) > 8) failures.push(`shell left full height at phaseB ${s.phaseB}: ${s.sheetH}`);
  if (s.threadDock !== "composer") failures.push(`thread not docked at phaseB ${s.phaseB}`);
  if (i > 0 && s.threadTop + 2 < phaseB[i - 1].threadTop) {
    failures.push(`thread top moved up at phaseB ${s.phaseB}`);
  }
}
if (phaseA.length < 2) failures.push("phase A samples missing");
for (const s of phaseA) {
  if (s.threadDock != null) failures.push(`phase A kept thread dock at phaseA ${s.phaseA}`);
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
console.log("PASS close thread stays on composer, shell stays full, phase A still shrinks");
await browser.close();
