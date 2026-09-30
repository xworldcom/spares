#!/usr/bin/env node
/**
 * Slow conversation-sheet collapse with live state logging (mobile viewport).
 * Usage (after control-oee360 launch):
 *   node .cursor/skills/verify-oee360/scripts/sheet-drag-debug.mjs --base-url http://127.0.0.1:3010
 */
import { chromium, devices } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = (() => {
  const i = process.argv.indexOf("--base-url");
  return i >= 0 ? process.argv[i + 1] : "http://127.0.0.1:3010";
})();

const outDir =
  process.env.OEE360_VERIFY_RUN_ID != null
    ? path.join(
        ".cursor/skills/verify-oee360/evidence",
        process.env.OEE360_VERIFY_RUN_ID,
      )
    : path.join(".cursor/skills/verify-oee360/evidence", "sheet-drag-debug");

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  ...devices["iPhone 13"],
  recordVideo: { dir: outDir, size: { width: 390, height: 844 } },
});
const page = await context.newPage();

const log = [];
function note(line) {
  log.push(`${Date.now()} ${line}`);
}

await page.goto(`${baseUrl}/staff/tickets?sheetDebug=1`, {
  waitUntil: "networkidle",
  timeout: 120_000,
});

const sheet = page.locator("[data-conversation-sheet]").first();
const hasSheet = await sheet.count();
if (!hasSheet) {
  note("no conversation sheet on page — open a ticket first or seed data");
  await writeFile(path.join(outDir, "sheet-drag-log.txt"), log.join("\n"));
  await browser.close();
  process.exit(0);
}

await sheet.waitFor({ state: "visible", timeout: 30_000 });

await page.evaluate(() => {
  const el = document.querySelector("[data-conversation-sheet]");
  el?.classList.add("is-reply");
});

const readState = () =>
  page.evaluate(() => {
    const el = document.querySelector("[data-conversation-sheet]");
    if (!el) return null;
    const style = getComputedStyle(el);
    return {
      dataSnap: el.getAttribute("data-snap"),
      layoutPeek: el.hasAttribute("data-layout-peek"),
      classes: ["is-peek", "is-reply", "is-full", "is-dragging"]
        .filter((c) => el.classList.contains(c))
        .join(","),
      sheetH: el.style.getPropertyValue("--sheet-h") || style.height,
      boxH: Math.round(el.getBoundingClientRect().height),
    };
  });

const handle = page.locator(".snap-sheet-handle").first();
const box = await handle.boundingBox();
if (!box) {
  note("no handle");
} else {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  note(`start ${JSON.stringify(await readState())}`);
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let step = 0; step <= 40; step += 1) {
    await page.mouse.move(cx, cy + step * 4, { steps: 1 });
    await page.waitForTimeout(40);
    if (step % 4 === 0) {
      note(`drag ${JSON.stringify(await readState())}`);
    }
  }
  note(`end ${JSON.stringify(await readState())}`);
  await page.mouse.up();
  await page.waitForTimeout(600);
  note(`release ${JSON.stringify(await readState())}`);
}

await page.screenshot({ path: path.join(outDir, "sheet-drag-end.png"), fullPage: true });
await writeFile(path.join(outDir, "sheet-drag-log.txt"), log.join("\n"));
await context.close();
await browser.close();
console.log(`Wrote ${outDir}/sheet-drag-log.txt and video`);
