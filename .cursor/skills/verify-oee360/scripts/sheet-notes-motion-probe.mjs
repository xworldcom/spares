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
  data: { title: "Ack dismiss preview", note: "test" },
});
if (!created.ok()) {
  console.error("create", created.status(), await created.text());
  process.exit(1);
}
const ticket = (await created.json()).ticket;
await page.request.patch(`${baseUrl}/api/tickets/${ticket.id}/assistant`, {
  data: { paused: true },
});
const reply = await page.request.post(`${baseUrl}/api/tickets/${ticket.id}/activity`, {
  data: { text: "Thanks — we're reviewing this now." },
});
if (!reply.ok()) {
  console.error("reply", reply.status(), await reply.text());
  process.exit(1);
}

await page.goto(`${baseUrl}/machines/palletizer/care/tickets/${ticket.id}`, {
  waitUntil: "domcontentloaded",
  timeout: 60_000,
});
await page.locator("[data-conversation-sheet]").first().waitFor({ state: "visible", timeout: 30_000 });
await page.waitForTimeout(500);

async function readGeom() {
  return page.evaluate(() => {
    const card = document.querySelector("[data-conversation-sheet]");
    const thread = card?.querySelector(".imsg-thread");
    const composer = card?.querySelector(".imsg-composer");
    const bubble = thread?.querySelector(".imsg-row:last-of-type .imsg-bubble");
    const head = document.querySelector(".care-stack-head");
    const cardBox = card.getBoundingClientRect();
    const bubbleBox = bubble?.getBoundingClientRect();
    const composerBox = composer?.getBoundingClientRect();
    const headBox = head?.getBoundingClientRect();
    const hits = [];
    if (headBox) {
      const ys = [0.18, 0.35, 0.55];
      for (const t of ys) {
        const x = cardBox.left + cardBox.width / 2;
        const y = cardBox.top + cardBox.height * t;
        const el = document.elementFromPoint(x, y);
        hits.push({
          y: Math.round(y),
          inSheet: !!(el && card.contains(el)),
          inHead: !!(el && head.contains(el)),
        });
      }
    }
    const overlap = headBox
      ? Math.max(0, Math.min(cardBox.bottom, headBox.bottom) - Math.max(cardBox.top, headBox.top)) *
        Math.max(0, Math.min(cardBox.right, headBox.right) - Math.max(cardBox.left, headBox.left))
      : 0;
    return {
      snap: card.getAttribute("data-snap"),
      dock: card.getAttribute("data-thread-dock"),
      layout: card.getAttribute("data-thread-layout"),
      sheetH: Math.round(cardBox.height),
      bubbleTop: bubbleBox ? Math.round(bubbleBox.top) : null,
      gap: bubbleBox && composerBox ? Math.round(composerBox.top - bubbleBox.bottom) : null,
      zSheet: getComputedStyle(card).zIndex,
      zHead: head ? getComputedStyle(head).zIndex : null,
      overlap: Math.round(overlap),
      hits,
    };
  });
}

async function waitSettled() {
  await page.waitForFunction(() => {
    const card = document.querySelector("[data-conversation-sheet]");
    return card && !card.classList.contains("is-settling") && !card.classList.contains("is-dragging");
  }, { timeout: 8000 });
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
    await page.mouse.move(x, y + (dy * i) / steps);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  await waitSettled();
}

const failures = [];
let guard = 0;
while ((await readGeom()).snap !== "full" && guard < 6) {
  await dragHandle(-520, 28);
  guard += 1;
}
const rest = await readGeom();
if (rest.snap !== "full") failures.push(`never reached full: ${JSON.stringify(rest)}`);

const handle = page.locator(".snap-sheet-handle").first();
const box = await handle.boundingBox();
const x = box.x + box.width / 2;
const y = box.y + box.height / 2;
await page.mouse.move(x, y);
await page.mouse.down();
await page.waitForTimeout(60);
const touch = await readGeom();
await page.mouse.up();
await waitSettled();

const bubbleJump = (touch.bubbleTop ?? 0) - (rest.bubbleTop ?? 0);
const gapJump = (touch.gap ?? 0) - (rest.gap ?? 0);
const heightJump = touch.sheetH - rest.sheetH;
console.log("rest", JSON.stringify(rest));
console.log("touch", JSON.stringify(touch));
console.log("delta", JSON.stringify({ bubbleJump, gapJump, heightJump }));
if (Math.abs(heightJump) > 2) {
  failures.push(`touch changed sheet height ${rest.sheetH} -> ${touch.sheetH}`);
}
if (Math.abs(bubbleJump) > 2) {
  failures.push(`touch jumped the latest bubble by ${bubbleJump}px`);
}
if (Math.abs(gapJump) > 4) {
  failures.push(`touch opened the composer gap by ${gapJump}px (${rest.gap} -> ${touch.gap})`);
}
if (touch.dock != null) {
  failures.push(`touch set thread dock ${touch.dock} before the sheet moved`);
}

guard = 0;
while ((await readGeom()).snap !== "peek" && guard < 4) {
  await dragHandle(700, 36);
  guard += 1;
}
const peek = await readGeom();
if (peek.snap !== "peek") failures.push(`did not return to peek: ${peek.snap}`);

const h2 = await handle.boundingBox();
const x2 = h2.x + h2.width / 2;
const y2 = h2.y + h2.height / 2;
await page.mouse.move(x2, y2);
await page.mouse.down();
let bleedFrames = 0;
let openFrames = 0;
for (let i = 1; i <= 36; i += 1) {
  await page.mouse.move(x2, y2 - i * 16);
  await page.waitForTimeout(24);
  if (i % 3 !== 0) continue;
  const g = await readGeom();
  openFrames += 1;
  const bleed = g.overlap > 8 && g.hits.some((hit) => hit.inHead || !hit.inSheet);
  if (bleed) {
    bleedFrames += 1;
    console.log("bleed", JSON.stringify(g));
  }
}
await page.mouse.up();
await waitSettled();
console.log("openFrames", openFrames, "bleedFrames", bleedFrames);
if (bleedFrames > 0) {
  failures.push(`ticket chrome painted through the sheet on ${bleedFrames} open frames`);
}

await browser.close();
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("PASS touch keeps the rested thread and open stays opaque");
