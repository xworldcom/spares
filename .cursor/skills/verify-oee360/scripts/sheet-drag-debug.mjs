#!/usr/bin/env node
/**
 * Slow conversation-sheet collapse with live state logging (mobile viewport).
 * Usage (after control-oee360 launch):
 *   node .cursor/skills/verify-oee360/scripts/sheet-drag-debug.mjs --base-url http://127.0.0.1:3010
 */
import { chromium, devices } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

async function loadSessionCookies(base) {
  const jar = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../.run-state/cookies.txt",
  );
  try {
    const raw = await readFile(jar, "utf8");
    const host = new URL(base).hostname;
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const parts = line.split("\t");
        if (parts.length < 7) {
          return null;
        }
        const [, , cookiePath, , , name, value] = parts;
        return { name, value, domain: host, path: cookiePath || "/" };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

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
const sessionCookies = await loadSessionCookies(baseUrl);
if (sessionCookies.length) {
  await context.addCookies(sessionCookies);
}
const page = await context.newPage();

const log = [];
function note(line) {
  log.push(`${Date.now()} ${line}`);
}

await page.request.post(`${baseUrl}/api/staff/quotes/preview-fixture`);

await page.goto(
  `${baseUrl}/staff/quotes/quote-preview-qa-conversation?sheetDebug=1`,
  {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  },
);

const sheet = page.locator("[data-conversation-sheet]").first();
try {
  await sheet.waitFor({ state: "visible", timeout: 30_000 });
} catch {
  note("no conversation sheet on page — open a ticket first or seed data");
  await writeFile(path.join(outDir, "sheet-drag-log.txt"), log.join("\n"));
  await context.close();
  await browser.close();
  process.exit(0);
}

await page.screenshot({
  path: path.join(outDir, "sheet-peek.png"),
  fullPage: false,
});

const readState = () =>
  page.evaluate(() => {
    const el = document.querySelector("[data-conversation-sheet]");
    if (!el) return null;
    const style = getComputedStyle(el);
    const title = el.querySelector(".conversation-sheet-toolbar-title");
    const handle = el.querySelector(".quote-sheet-handle");
    const chip = el.querySelector(".imsg-chip");
    const titleStyle = title ? getComputedStyle(title) : null;
    const handleStyle = handle ? getComputedStyle(handle) : null;
    const chipStyle = chip ? getComputedStyle(chip) : null;
    const handleBox = handle?.getBoundingClientRect();
    return {
      dataSnap: el.getAttribute("data-snap"),
      layoutPeek: el.hasAttribute("data-layout-peek"),
      classes: ["is-peek", "is-reply", "is-full", "is-dragging"]
        .filter((c) => el.classList.contains(c))
        .join(","),
      sheetH: el.style.getPropertyValue("--sheet-h") || style.height,
      boxH: Math.round(el.getBoundingClientRect().height),
      title: titleStyle
        ? {
            fontSize: titleStyle.fontSize,
            fontWeight: titleStyle.fontWeight,
            letterSpacing: titleStyle.letterSpacing,
          }
        : null,
      handle: handleStyle && handleBox
        ? {
            width: Math.round(handleBox.width),
            height: Math.round(handleBox.height),
          }
        : null,
      chip: chipStyle
        ? {
            fontSize: chipStyle.fontSize,
            fontWeight: chipStyle.fontWeight,
          }
        : null,
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

const metrics = log
  .map((line) => {
    const idx = line.indexOf("{");
    if (idx < 0) {
      return null;
    }
    try {
      return JSON.parse(line.slice(idx));
    } catch {
      return null;
    }
  })
  .filter((m) => m?.title);
const baseline = metrics[0];
const chromeStable =
  baseline?.title &&
  metrics.every(
    (m) =>
      m?.title?.fontSize === baseline.title.fontSize &&
      m?.title?.fontWeight === baseline.title.fontWeight &&
      m?.handle?.height === baseline.handle?.height &&
      m?.handle?.width === baseline.handle?.width,
  );
note(`chrome-metrics-stable: ${chromeStable ? "PASS" : "FAIL"}`);

await page.screenshot({ path: path.join(outDir, "sheet-drag-end.png"), fullPage: true });
await writeFile(path.join(outDir, "sheet-drag-log.txt"), log.join("\n"));
await context.close();
await browser.close();
console.log(`Wrote ${outDir}/sheet-drag-log.txt and video`);
console.log(`chrome-metrics-stable: ${chromeStable ? "PASS" : "FAIL"}`);
process.exit(chromeStable ? 0 : 1);
