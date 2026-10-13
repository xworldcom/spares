#!/usr/bin/env node
/**
 * Care ticket overlay sheet — peek load, pull-up, close button (issues #436/#437).
 * node scripts/care-sheet-436-probe.mjs http://127.0.0.1:3010
 */
import { chromium, devices } from "playwright";

const baseUrl = process.argv[2] || "http://127.0.0.1:3010";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  ...devices["iPhone 13"],
  viewport: { width: 390, height: 844 },
});
const page = await context.newPage();

const isLocal = baseUrl.includes("127.0.0.1") || baseUrl.includes("localhost");
const login = await page.request.post(`${baseUrl}/api/auth/login`, {
  data: isLocal
    ? { email: "staff@spares.local", password: "SparesStaff1!" }
    : { email: "user@demo.com", password: "demo123456" },
});
if (!login.ok()) {
  console.error("login", login.status(), await login.text());
  process.exit(1);
}

let ticketId = "33b3f964-56cd-42a1-8098-3f08608c3103";
if (isLocal) {
  const created = await page.request.post(`${baseUrl}/api/machines/palletizer/tickets`, {
    data: { title: "Sheet motion probe", note: "probe" },
  });
  if (!created.ok()) {
    console.error("create ticket", created.status(), await created.text());
    process.exit(1);
  }
  ticketId = (await created.json()).ticket.id;
  await page.request.post(`${baseUrl}/api/tickets/${ticketId}/activity`, {
    data: { text: "Hello from probe — latest row should sit above composer." },
  });
}
const paths = [
  `/machines/palletizer/care/tickets/${ticketId}?sheetDebug=1`,
  `/care/tickets/${ticketId}?sheetDebug=1`,
];

async function geom() {
  return page.evaluate(() => {
    const card = document.querySelector("[data-conversation-sheet]");
    if (!card) return { missing: true };
    const box = card.getBoundingClientRect();
    const style = getComputedStyle(card);
    const inlineH = card.style.getPropertyValue("--sheet-h").trim();
    const replyH = style.getPropertyValue("--reply-h").trim();
    const peekH = style.getPropertyValue("--peek-h").trim();
    const closeTy = style.getPropertyValue("--sheet-close-ty").trim();
    const composer = card.querySelector(".imsg-composer");
    const compBox = composer?.getBoundingClientRect();
    return {
      snap: card.getAttribute("data-snap"),
      classes: [...card.classList].filter((c) => c.startsWith("is-")).join(" "),
      boxH: Math.round(box.height),
      inlineH,
      replyH,
      peekH,
      closeTy,
      composerH: compBox ? Math.round(compBox.height) : 0,
      composerVisible: compBox ? compBox.height > 4 : false,
      motionLive: card.hasAttribute("data-motion-live"),
    };
  });
}

async function waitSettled() {
  await page.waitForFunction(
    () => {
      const card = document.querySelector("[data-conversation-sheet]");
      return card && !card.classList.contains("is-settling") && !card.classList.contains("is-dragging");
    },
    { timeout: 8000 },
  );
  await page.waitForTimeout(120);
}

const results = [];

for (const path of paths) {
  await page.goto(`${baseUrl}${path}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.locator("[data-conversation-sheet]").first().waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(600);
  const initial = await geom();
  results.push({ path, phase: "initial", ...initial });

  const handle = page.locator(".snap-sheet-handle").first();
  const handleBox = await handle.boundingBox();
  if (!handleBox) {
    results.push({ path, phase: "drag", error: "no handle" });
    continue;
  }
  const cx = handleBox.x + handleBox.width / 2;
  const cy = handleBox.y + handleBox.height / 2;
  const samples = [];
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let step = 0; step <= 12; step += 1) {
    const y = cy - step * 28;
    await page.mouse.move(cx, y, { steps: 2 });
    await page.waitForTimeout(40);
    samples.push(await geom());
  }
  await page.mouse.up();
  await waitSettled();
  const afterDrag = await geom();
  results.push({ path, phase: "after-drag-up", ...afterDrag, dragMinH: Math.min(...samples.map((s) => s.boxH)) });

  await handle.click({ force: true });
  await waitSettled();
  const full = await geom();
  results.push({ path, phase: "full", ...full });

  const closeBtn = page.locator(".conversation-sheet-close").first();
  await closeBtn.click({ force: true });
  await waitSettled();
  const afterClose1 = await geom();
  results.push({ path, phase: "after-close-from-full", ...afterClose1 });

  await page.waitForTimeout(450);
  await closeBtn.click({ force: true });
  await waitSettled();
  const afterClose2 = await geom();
  results.push({ path, phase: "after-close-from-peek", ...afterClose2 });
}

await browser.close();
console.log(JSON.stringify(results, null, 2));

const peekExpect = 92;
let fail = false;
for (const row of results) {
  if (row.phase === "initial" && row.boxH < 70) {
    console.error("FAIL initial sheet too small", row);
    fail = true;
  }
  if (row.phase === "initial" && row.boxH > 140 && row.classes?.includes("is-peek")) {
    console.error("FAIL peek snap but reply-sized height", row);
    fail = true;
  }
  if (row.phase === "after-close-from-full" && row.classes?.includes("is-reply") && !row.classes?.includes("is-peek")) {
    console.error("FAIL close from full should land on peek not reply", row);
    fail = true;
  }
  if (row.phase === "after-close-from-full" && row.boxH > 160) {
    console.error("FAIL close from full height too large for peek band", row);
    fail = true;
  }
  if (row.phase === "after-drag-up" && row.dragMinH > 130) {
    console.error("FAIL pull-up jumped past peek band without tracking finger", row);
    fail = true;
  }
  if (row.phase === "after-close-from-peek" && !row.classes?.includes("is-out")) {
    console.error("FAIL second close should dismiss sheet to out", row);
    fail = true;
  }
}
process.exit(fail ? 1 : 0);
