#!/usr/bin/env node
/**
 * Long thread at full: user can scroll up; pin must not snap back while reading history.
 * node .cursor/skills/verify-oee360/scripts/sheet-long-thread-scroll-probe.mjs http://127.0.0.1:3010
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
await page.request.post(`${baseUrl}/api/staff/quotes/preview-fixture`);
const quoteId = "quote-preview-qa-conversation";
for (let n = 1; n <= 48; n += 1) {
  await page.request.post(`${baseUrl}/api/quotes/${quoteId}/activity`, {
    data: { text: `Long thread line ${n} — enough height to require scroll.` },
  });
}
await page.goto(`${baseUrl}/staff/quotes/${quoteId}`, {
  waitUntil: "domcontentloaded",
});
await page.locator("[data-conversation-sheet]").first().waitFor();
await page.waitForTimeout(400);

async function readThread() {
  return page.evaluate(() => {
    const card = document.querySelector("[data-conversation-sheet]");
    const thread = card?.querySelector(".imsg-thread");
    const maxScroll = thread
      ? Math.max(0, thread.scrollHeight - thread.clientHeight)
      : 0;
    return {
      snap: card?.getAttribute("data-snap"),
      scrollTop: thread ? Math.round(thread.scrollTop) : null,
      maxScroll: Math.round(maxScroll),
      underflow: thread?.hasAttribute("data-thread-underflow") ?? false,
      overflowY: thread ? getComputedStyle(thread).overflowY : null,
    };
  });
}

async function openFull() {
  const handle = page.locator(".snap-sheet-handle").first();
  const box = await handle.boundingBox();
  if (!box) throw new Error("no handle");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 30; i += 1) {
    await page.mouse.move(x, y + (-560 * i) / 30);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  await page.waitForFunction(() => {
    const card = document.querySelector("[data-conversation-sheet]");
    return (
      card &&
      !card.classList.contains("is-dragging") &&
      !card.classList.contains("is-settling")
    );
  });
  await page.waitForTimeout(300);
}

const failures = [];
await openFull();
const atBottom = await readThread();
console.log("atBottom", atBottom);
if (atBottom.snap !== "full") failures.push(`expected full, got ${atBottom.snap}`);
if (atBottom.maxScroll < 80) failures.push(`expected scrollable thread, maxScroll=${atBottom.maxScroll}`);
if (atBottom.underflow) failures.push("long thread must not use data-thread-underflow");
if (atBottom.overflowY !== "auto") failures.push(`overflow should be auto, got ${atBottom.overflowY}`);
if (atBottom.maxScroll > 80 && atBottom.scrollTop < atBottom.maxScroll - 40) {
  failures.push(`expected pinned to bottom before scroll-up, scrollTop=${atBottom.scrollTop}`);
}

await page.evaluate(() => {
  const thread = document.querySelector(".imsg-thread");
  if (thread instanceof HTMLElement) {
    thread.scrollTop = 0;
  }
});
await page.waitForTimeout(120);
const scrolledUp = await readThread();
console.log("scrolledUp", scrolledUp);
if (scrolledUp.maxScroll > 80 && scrolledUp.scrollTop > 40) {
  failures.push(`scroll up failed, scrollTop=${scrolledUp.scrollTop}`);
}

await page.waitForTimeout(400);
const afterWait = await readThread();
console.log("afterWait", afterWait);
if (afterWait.maxScroll > 80 && afterWait.scrollTop > 40) {
  failures.push(`pin re-locked scroll after user scrolled up: scrollTop=${afterWait.scrollTop}`);
}

await browser.close();
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("PASS long-thread scroll-up");
