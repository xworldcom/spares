#!/usr/bin/env node
/**
 * Staff quote conversation sheet @390 — slow drag + intermediate seating (Kevin #357).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, devices } from "playwright";

const baseUrl = process.env.OEE360_BASE_URL || "https://oee360.com";
const quoteRef = process.env.OEE360_QUOTE_REF || "29";
const outDir = resolve(
  process.env.OEE360_EVIDENCE_DIR ||
    "/cursor/stores/self/media/staff-app/issue-357-quote-sheet",
);
mkdirSync(outDir, { recursive: true });

const proof = { baseUrl, quoteRef, checks: [], ok: true };
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  ...devices["iPhone 13"],
  viewport: { width: 390, height: 844 },
  recordVideo: { dir: outDir, size: { width: 390, height: 844 } },
});
await context.request.post(`${baseUrl}/api/auth/login`, {
  data: { email: "staff@demo.com", password: "demo123456" },
});
const page = await context.newPage();
await page.goto(`${baseUrl}/staff/quotes/${quoteRef}?sheetDebug=1`, {
  waitUntil: "domcontentloaded",
  timeout: 120000,
});
await page.locator("[data-conversation-sheet]").waitFor({ timeout: 60000 });
await page.waitForTimeout(500);

async function geom() {
  return page.evaluate(() => {
    const card = document.querySelector("[data-conversation-sheet]");
    const tab = document.querySelector(".spares-tabbar");
    const composer = card?.querySelector(".imsg-composer");
    const tabBox = tab?.getBoundingClientRect();
    const compBox = composer?.getBoundingClientRect();
    const cardBox = card?.getBoundingClientRect();
    return {
      snap: card?.getAttribute("data-snap"),
      sheetH: cardBox ? Math.round(cardBox.height) : 0,
      composerAboveTabs: !!(tabBox && compBox && compBox.bottom <= tabBox.top + 2),
    };
  });
}

const rest = await geom();
proof.checks.push({ id: "rest-intermediate", ...rest, pass: rest.snap === "reply" && rest.composerAboveTabs });
if (!proof.checks.at(-1).pass) proof.ok = false;

const handle = page.locator(".snap-sheet-handle").first();
const box = await handle.boundingBox();
if (box) {
  const x = box.x + box.width / 2;
  let y = box.y + box.height / 2;
  await page.touchscreen.tap(x, y);
  for (let i = 0; i < 40; i += 1) {
    y += 5;
    await page.evaluate(
      ({ x, y }) => {
        const card = document.querySelector("[data-conversation-sheet]");
        card?.dispatchEvent(
          new PointerEvent("pointermove", {
            bubbles: true,
            clientX: x,
            clientY: y,
            pointerId: 1,
            pointerType: "touch",
          }),
        );
      },
      { x, y },
    );
    await page.waitForTimeout(80);
  }
  await page.evaluate(
    ({ x, y }) => {
      const card = document.querySelector("[data-conversation-sheet]");
      card?.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          clientX: x,
          clientY: y,
          pointerId: 1,
          pointerType: "touch",
        }),
      );
    },
    { x, y },
  );
  await page.waitForTimeout(1200);
}

const afterDrag = await geom();
proof.checks.push({
  id: "after-slow-drag-down",
  ...afterDrag,
  pass: afterDrag.sheetH > 120 && afterDrag.sheetH < 700,
});
if (!proof.checks.at(-1).pass) proof.ok = false;

await page.screenshot({ path: join(outDir, "after-slow-drag-390.png") });
await context.close();
await browser.close();
writeFileSync(join(outDir, "proof.json"), JSON.stringify(proof, null, 2));
console.log(JSON.stringify(proof, null, 2));
process.exit(proof.ok ? 0 : 1);
