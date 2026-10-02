#!/usr/bin/env node
/**
 * Narrow-desktop Care Notes sheet open + close recording for Tess gate.
 * node .cursor/skills/verify-oee360/scripts/sheet-motion-video.mjs http://127.0.0.1:3010 /opt/cursor/artifacts/sheet-motion-demo.webm
 */
import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const baseUrl = process.argv[2] || "http://127.0.0.1:3010";
const out = process.argv[3] || "/opt/cursor/artifacts/sheet-motion-demo.webm";
mkdirSync(dirname(out), { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  ...devices["iPhone 13"],
  viewport: { width: 390, height: 844 },
  recordVideo: { dir: dirname(out), size: { width: 390, height: 844 } },
});
const page = await context.newPage();

const login = await page.request.post(`${baseUrl}/api/auth/login`, {
  data: { email: "staff@spares.local", password: "SparesStaff1!" },
});
if (!login.ok()) process.exit(1);
const created = await page.request.post(`${baseUrl}/api/machines/palletizer/tickets`, {
  data: { title: "Sheet motion video", note: "demo" },
});
const ticket = (await created.json()).ticket;
await page.request.post(`${baseUrl}/api/tickets/${ticket.id}/activity`, {
  data: { text: "Thanks — we're reviewing this now." },
});
for (let n = 1; n <= 6; n += 1) {
  await page.request.post(`${baseUrl}/api/tickets/${ticket.id}/activity`, {
    data: { text: `History line ${n} for open roll.` },
  });
}

await page.goto(`${baseUrl}/machines/palletizer/care/tickets/${ticket.id}`, {
  waitUntil: "domcontentloaded",
});
await page.locator("[data-conversation-sheet]").first().waitFor({ state: "visible" });
await page.waitForTimeout(800);

async function dragHandle(dy, steps) {
  const handle = page.locator(".snap-sheet-handle").first();
  const box = await handle.boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(x, y + (dy * i) / steps);
    await page.waitForTimeout(28);
  }
  await page.mouse.up();
  await page.waitForTimeout(500);
}

await dragHandle(-520, 36);
await page.waitForTimeout(600);
await dragHandle(680, 40);
await page.waitForTimeout(800);

await context.close();
await browser.close();
console.log("video recorded under", dirname(out));
