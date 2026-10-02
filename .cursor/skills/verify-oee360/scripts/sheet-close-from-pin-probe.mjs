#!/usr/bin/env node
/**
 * Handle drag must collapse from natural full pin (scrollTop === maxScroll).
 * node .cursor/skills/verify-oee360/scripts/sheet-close-from-pin-probe.mjs http://127.0.0.1:3010
 */
import { chromium, devices } from "playwright";

const baseUrl = process.argv[2] || "http://127.0.0.1:3010";

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
  data: { title: "Close from pin", note: "probe" },
});
if (!created.ok()) {
  console.error("create", created.status());
  process.exit(1);
}
const ticket = (await created.json()).ticket;
for (let n = 1; n <= 12; n += 1) {
  await page.request.post(`${baseUrl}/api/tickets/${ticket.id}/activity`, {
    data: { text: `Pin probe history line ${n} with enough text to scroll.` },
  });
}

await page.goto(`${baseUrl}/machines/palletizer/care/tickets/${ticket.id}`, {
  waitUntil: "domcontentloaded",
});
await page.locator("[data-conversation-sheet]").first().waitFor();
await page.waitForTimeout(500);

async function threadPin() {
  return page.evaluate(() => {
    const thread = document.querySelector(".imsg-thread");
    if (!thread) return null;
    const maxScroll = Math.max(0, thread.scrollHeight - thread.clientHeight);
    return {
      snap: document.querySelector("[data-conversation-sheet]")?.getAttribute("data-snap"),
      scrollTop: Math.round(thread.scrollTop),
      maxScroll: Math.round(maxScroll),
      pinned: Math.abs(thread.scrollTop - maxScroll) <= 2,
      sheetH: Math.round(
        document.querySelector("[data-conversation-sheet]")?.getBoundingClientRect().height ?? 0,
      ),
      dragging: document
        .querySelector("[data-conversation-sheet]")
        ?.classList.contains("is-dragging"),
    };
  });
}

async function waitSettled() {
  await page.waitForFunction(() => {
    const card = document.querySelector("[data-conversation-sheet]");
    return card && !card.classList.contains("is-dragging") && !card.classList.contains("is-settling");
  }, { timeout: 8000 });
  await page.waitForTimeout(300);
}

async function dragHandle(dy, steps = 24, release = true) {
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
  const mid = await threadPin();
  if (release) {
    await page.mouse.up();
    await waitSettled();
  }
  return mid;
}

let pin = await threadPin();
let guard = 0;
while (pin?.snap !== "full" && guard < 4) {
  await dragHandle(-560, 34, true);
  pin = await threadPin();
  guard += 1;
}
if (pin?.snap !== "full") {
  console.error("never reached full", pin);
  process.exit(2);
}
if (!pin.pinned) {
  console.error("full but not pinned to bottom", pin);
  process.exit(3);
}
if (pin.maxScroll < 40) {
  console.error("expected scrollable full thread for maxScroll pin", pin);
  process.exit(3);
}

const startH = pin.sheetH;
const mid = await dragHandle(120, 16, false);
if (!mid?.dragging) {
  console.error("handle drag did not start from pinned full", { before: pin, mid });
  process.exit(4);
}
if (mid.sheetH >= startH - 8) {
  console.error("sheet did not shrink during handle close drag", { startH, mid });
  process.exit(5);
}
await page.mouse.up();
await waitSettled();
console.log(JSON.stringify({ pin, mid }));
console.log("PASS handle close from maxScroll pin");
await browser.close();
