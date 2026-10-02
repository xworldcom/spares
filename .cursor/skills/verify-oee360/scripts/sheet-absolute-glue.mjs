#!/usr/bin/env node
/**
 * Tess Absolute glue gate: latest chip tracks composer through open + close roll-up.
 * node .cursor/skills/verify-oee360/scripts/sheet-absolute-glue.mjs http://127.0.0.1:3010
 */
import { chromium, devices } from "playwright";

const baseUrl = process.argv[2] || "http://127.0.0.1:3010";
const GLUE_MAX_SPREAD = 12;
const CHIP_MAX_JUMP = 12;

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
const created = await page.request.post(`${baseUrl}/api/machines/palletizer/tickets`, {
  data: { title: "Absolute glue", note: "probe" },
});
if (!created.ok()) {
  console.error("create", created.status(), await created.text());
  process.exit(1);
}
const ticket = (await created.json()).ticket;
await page.request.post(`${baseUrl}/api/tickets/${ticket.id}/activity`, {
  data: { text: "Latest staff reply for glue probe." },
});
for (let n = 1; n <= 6; n += 1) {
  await page.request.post(`${baseUrl}/api/tickets/${ticket.id}/activity`, {
    data: { text: `History ${n} above the latest chip.` },
  });
}

await page.goto(`${baseUrl}/machines/palletizer/care/tickets/${ticket.id}`, {
  waitUntil: "domcontentloaded",
});
await page.locator("[data-conversation-sheet]").first().waitFor();
await page.waitForTimeout(500);

async function sample() {
  return page.evaluate(() => {
    const card = document.querySelector("[data-conversation-sheet]");
    const thread = card?.querySelector(".imsg-thread");
    const composer = card?.querySelector(".imsg-composer");
    const chip = thread?.querySelector(":scope > li:last-of-type .imsg-bubble, :scope > li:last-of-type .imsg-chip");
    const chipBox = chip?.getBoundingClientRect();
    const composerBox = composer?.getBoundingClientRect();
    const send = card?.querySelector(".imsg-send, button[type='submit']");
    const sendBox = send?.getBoundingClientRect();
    const gap =
      chipBox && composerBox ? Math.round(composerBox.top - chipBox.bottom) : null;
    return {
      snap: card?.getAttribute("data-snap"),
      gap,
      chipTop: chipBox ? Math.round(chipBox.top) : null,
      composerTop: composerBox ? Math.round(composerBox.top) : null,
      sendVisible: !!(sendBox && sendBox.height > 8 && sendBox.width > 8),
      motion: card?.hasAttribute("data-motion-live"),
      dragging: card?.classList.contains("is-dragging"),
      settling: card?.classList.contains("is-settling"),
    };
  });
}

async function dragHandle(dy, steps) {
  const handle = page.locator(".snap-sheet-handle").first();
  const box = await handle.boundingBox();
  if (!box) throw new Error("no handle");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  const samples = [];
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(x, y + (dy * i) / steps);
    await page.waitForTimeout(20);
    if (i % 2 === 0) samples.push(await sample());
  }
  await page.mouse.up();
  await page.waitForTimeout(400);
  return samples;
}

const rest = await sample();
const openSamples = await dragHandle(-560, 32);
const openGaps = openSamples.map((s) => s.gap).filter((g) => g != null);
const openSpread = openGaps.length ? Math.max(...openGaps) - Math.min(...openGaps) : 0;
const openChipJump =
  openSamples.length > 1
    ? Math.max(...openSamples.map((s) => s.chipTop)) - Math.min(...openSamples.map((s) => s.chipTop))
    : 0;
const composerOpenDelta =
  openSamples.length > 1
    ? Math.max(...openSamples.map((s) => s.composerTop)) -
      Math.min(...openSamples.map((s) => s.composerTop))
    : 0;

const closeSamples = await dragHandle(620, 36);
const closeGaps = closeSamples.map((s) => s.gap).filter((g) => g != null);
const closeSpread = closeGaps.length ? Math.max(...closeGaps) - Math.min(...closeGaps) : 0;
const closeChipJump =
  closeSamples.length > 1
    ? Math.max(...closeSamples.map((s) => s.chipTop)) - Math.min(...closeSamples.map((s) => s.chipTop))
    : 0;
const composerCloseDelta =
  closeSamples.length > 1
    ? Math.max(...closeSamples.map((s) => s.composerTop)) -
      Math.min(...closeSamples.map((s) => s.composerTop))
    : 0;

const closeTracksComposer =
  closeSpread <= GLUE_MAX_SPREAD && closeChipJump <= CHIP_MAX_JUMP && composerCloseDelta <= 2;
const openTracksComposer =
  openSpread <= GLUE_MAX_SPREAD && openChipJump <= CHIP_MAX_JUMP && composerOpenDelta <= 2;

console.log(
  JSON.stringify({
    rest,
    openTracksComposer,
    openGapSpread: openSpread,
    openJumpChip: openChipJump,
    composerOpenDelta,
    closeTracksComposer,
    closeGapSpread: closeSpread,
    closeJumpChip: closeChipJump,
    composerCloseDelta,
  }),
);

await browser.close();
const failures = [];
if (rest.snap !== "reply") failures.push(`rest snap ${rest.snap}`);
if (!rest.sendVisible) failures.push("composer/send not visible at rest");
if (!openTracksComposer) failures.push("OPEN GLUE FAIL");
if (!closeTracksComposer) failures.push("CLOSE GLUE FAIL");
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("PASS absolute glue open+close");
