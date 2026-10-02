#!/usr/bin/env node
/**
 * Tess scroll-anchor gate: latest row stays above composer on open + new message.
 * node .cursor/skills/verify-oee360/scripts/sheet-scroll-anchor-probe.mjs http://127.0.0.1:3010
 */
import { chromium, devices } from "playwright";

const baseUrl = process.argv[2] || "http://127.0.0.1:3010";
const MAX_SCROLL_JUMP = 48;
const MAX_CHIP_JUMP = 14;

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
  data: { title: "Scroll anchor", note: "probe" },
});
if (!created.ok()) {
  console.error("create", created.status(), await created.text());
  process.exit(1);
}
const ticket = (await created.json()).ticket;
for (let n = 1; n <= 10; n += 1) {
  await page.request.post(`${baseUrl}/api/tickets/${ticket.id}/activity`, {
    data: { text: `History line ${n} for scroll anchor probe.` },
  });
}
await page.request.post(`${baseUrl}/api/tickets/${ticket.id}/activity`, {
  data: { text: "Latest anchor line for probe." },
});

await page.goto(`${baseUrl}/machines/palletizer/care/tickets/${ticket.id}`, {
  waitUntil: "domcontentloaded",
});
await page.locator("[data-conversation-sheet]").first().waitFor();
await page.waitForTimeout(500);

async function readThread() {
  return page.evaluate(() => {
    const card = document.querySelector("[data-conversation-sheet]");
    const thread = card?.querySelector(".imsg-thread");
    const composer = card?.querySelector(".imsg-composer");
    const rows = [...(thread?.querySelectorAll(":scope > li") ?? [])];
    const last = rows.at(-1);
    const lastBox = last?.getBoundingClientRect();
    const composerBox = composer?.getBoundingClientRect();
    const threadBox = thread?.getBoundingClientRect();
    const first = rows[0];
    const firstBox = first?.getBoundingClientRect();
    const maxScroll = thread
      ? Math.max(0, thread.scrollHeight - thread.clientHeight)
      : 0;
    return {
      snap: card?.getAttribute("data-snap"),
      scrollTop: thread ? Math.round(thread.scrollTop) : null,
      maxScroll: Math.round(maxScroll),
      gap: lastBox && composerBox ? Math.round(composerBox.top - lastBox.bottom) : null,
      lastTop: lastBox ? Math.round(lastBox.top) : null,
      firstVisible:
        firstBox && threadBox
          ? Math.round(
              Math.min(firstBox.bottom, threadBox.bottom) - Math.max(firstBox.top, threadBox.top),
            )
          : 0,
      overflow: thread ? getComputedStyle(thread).overflowY : null,
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
    await page.waitForTimeout(18);
    if (i % 2 === 0) samples.push(await readThread());
  }
  await page.mouse.up();
  await page.waitForTimeout(450);
  samples.push(await readThread());
  return samples;
}

const failures = [];
const rest = await readThread();
if (rest.snap !== "reply") failures.push(`rest snap ${rest.snap}`);
if (rest.scrollTop !== 0) failures.push(`reply should keep scrollTop 0, got ${rest.scrollTop}`);

const openSamples = await dragHandle(-560, 34);
const openRest = openSamples.at(-1);
const openChipTops = openSamples.map((s) => s.lastTop).filter((v) => v != null);
const openChipJump =
  openChipTops.length > 1 ? Math.max(...openChipTops) - Math.min(...openChipTops) : 0;
const openScrollJump = openSamples.some(
  (s, i) => i > 0 && s.maxScroll > 40 && s.scrollTop < s.maxScroll - MAX_SCROLL_JUMP,
);

if (openRest?.snap !== "full") failures.push(`open did not reach full: ${openRest?.snap}`);
if (openRest && openRest.maxScroll > 40 && openRest.scrollTop < openRest.maxScroll - 8) {
  failures.push(
    `settled full not pinned to bottom: scroll ${openRest.scrollTop}/${openRest.maxScroll}`,
  );
}
if (openRest && openRest.firstVisible > 24) {
  failures.push(`open shows old history at top (first row vis ${openRest.firstVisible}px)`);
}
if (openScrollJump) failures.push("scroll unpinned during open drag");
if (openChipJump > MAX_CHIP_JUMP) failures.push(`latest row jumped ${openChipJump}px during open`);

const beforeMsg = await readThread();
await page.request.post(`${baseUrl}/api/tickets/${ticket.id}/activity`, {
  data: { text: "New inbound message after open." },
});
await page.waitForTimeout(200);
const afterMsg = await readThread();
if (afterMsg.maxScroll > 40 && afterMsg.scrollTop < afterMsg.maxScroll - 8) {
  failures.push(
    `new message not pinned: scroll ${afterMsg.scrollTop}/${afterMsg.maxScroll}`,
  );
}
if (
  beforeMsg.lastTop != null &&
  afterMsg.lastTop != null &&
  Math.abs(afterMsg.lastTop - beforeMsg.lastTop) > MAX_CHIP_JUMP
) {
  failures.push(`new message jumped latest row by ${afterMsg.lastTop - beforeMsg.lastTop}px`);
}

console.log(JSON.stringify({ rest, openRest, beforeMsg, afterMsg, openChipJump }));
await browser.close();

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("PASS scroll anchor open + new message");
