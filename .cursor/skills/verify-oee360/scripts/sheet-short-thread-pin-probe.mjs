#!/usr/bin/env node
/**
 * Short thread at full snap: latest row glued above composer, empty space above messages.
 * node .cursor/skills/verify-oee360/scripts/sheet-short-thread-pin-probe.mjs http://127.0.0.1:3010
 */
import { chromium, devices } from "playwright";

const baseUrl = process.argv[2] || "http://127.0.0.1:3010";
const MAX_GAP_ABOVE_COMPOSER = 72;
const MIN_EMPTY_ABOVE_FIRST = 48;

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
  data: { title: "Short thread pin", note: "Only message on a short thread." },
});
if (!created.ok()) {
  console.error("create", created.status(), await created.text());
  process.exit(1);
}
const ticket = (await created.json()).ticket;

await page.goto(`${baseUrl}/machines/palletizer/care/tickets/${ticket.id}`, {
  waitUntil: "domcontentloaded",
});
await page.locator("[data-conversation-sheet]").first().waitFor();
await page.waitForTimeout(400);

async function readLayout() {
  return page.evaluate(() => {
    const card = document.querySelector("[data-conversation-sheet]");
    const thread = card?.querySelector(".imsg-thread");
    const composer = card?.querySelector(".imsg-composer");
    const rows = [...(thread?.querySelectorAll(":scope > li") ?? [])];
    const first = rows[0];
    const last = rows.at(-1);
    const threadBox = thread?.getBoundingClientRect();
    const firstBox = first?.getBoundingClientRect();
    const lastBox = last?.getBoundingClientRect();
    const composerBox = composer?.getBoundingClientRect();
    const maxScroll = thread
      ? Math.max(0, thread.scrollHeight - thread.clientHeight)
      : 0;
    return {
      snap: card?.getAttribute("data-snap"),
      scrollTop: thread ? Math.round(thread.scrollTop) : null,
      maxScroll: Math.round(maxScroll),
      gapToComposer:
        lastBox && composerBox ? Math.round(composerBox.top - lastBox.bottom) : null,
      emptyAboveFirst:
        firstBox && threadBox ? Math.round(firstBox.top - threadBox.top) : null,
      threadHeight: threadBox ? Math.round(threadBox.height) : null,
      underflow: thread?.hasAttribute("data-thread-underflow") ?? false,
      settling: card?.classList.contains("is-settling") ?? false,
    };
  });
}

async function dragHandleOpen() {
  const handle = page.locator(".snap-sheet-handle").first();
  const box = await handle.boundingBox();
  if (!box) throw new Error("no handle");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  let midDrag = null;
  for (let i = 1; i <= 34; i += 1) {
    await page.mouse.move(x, y + (-560 * i) / 34);
    await page.waitForTimeout(18);
    if (i === 20) midDrag = await readLayout();
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
  await page.waitForTimeout(350);
  const settled = await readLayout();
  return { midDrag, settled };
}

const failures = [];
const { midDrag, settled: full } = await dragHandleOpen();

if (midDrag && (midDrag.gapToComposer == null || midDrag.gapToComposer > MAX_GAP_ABOVE_COMPOSER)) {
  failures.push(`mid-drag not glued: gap ${midDrag.gapToComposer}`);
}

if (full.snap !== "full") failures.push(`expected full snap, got ${full.snap}`);
if (full.maxScroll > 8) {
  failures.push(`expected short thread (maxScroll≈0), got ${full.maxScroll}`);
}
if (full.scrollTop !== 0) {
  failures.push(`short full should keep scrollTop 0, got ${full.scrollTop}`);
}
if (full.gapToComposer == null || full.gapToComposer > MAX_GAP_ABOVE_COMPOSER) {
  failures.push(`latest not glued to composer: gap ${full.gapToComposer}`);
}
if (
  full.emptyAboveFirst == null ||
  full.emptyAboveFirst < MIN_EMPTY_ABOVE_FIRST
) {
  failures.push(
    `after release: empty space should be above messages, not below: emptyAboveFirst=${full.emptyAboveFirst}`,
  );
}
if (!full.underflow) {
  failures.push("settled full short thread should mark data-thread-underflow");
}

if (failures.length) {
  console.error(JSON.stringify({ full, failures }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ midDrag, full }, null, 2));
console.log("PASS short-thread bottom pin at full");
await browser.close();
