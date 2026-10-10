#!/usr/bin/env node
/**
 * Early-frame landing FOUC stills (cold cache).
 * Usage: node hydration-345-fouc-capture.mjs <baseUrl> <outDir> <labelPrefix>
 * Writes: {label}-fouc-{1440|390}-{100ms|300ms|fcp}.png
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const baseUrl = (process.argv[2] || "http://127.0.0.1:3020").replace(/\/$/, "");
const outDir = process.argv[3] || "/tmp/hydration-parity";
const label = process.argv[4] || "build";

async function disableCache(page) {
  const client = await page.context().newCDPSession(page);
  await client.send("Network.enable");
  await client.send("Network.setCacheDisabled", { cacheDisabled: true });
}

async function shot(page, file) {
  await page.screenshot({ path: file, fullPage: false });
  console.log("wrote", file);
}

async function captureViewport(browser, viewport, tag) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await disableCache(page);
  await page.addInitScript(() => {
    window.__foucNavAt = performance.now();
  });

  const nav = page.goto(`${baseUrl}/`, { waitUntil: "commit", timeout: 120_000 });
  const t0 = Date.now();

  await new Promise((r) => setTimeout(r, Math.max(0, 100 - (Date.now() - t0))));
  await shot(page, join(outDir, `${label}-fouc-${tag}-100ms.png`));

  await new Promise((r) => setTimeout(r, Math.max(0, 300 - (Date.now() - t0))));
  await shot(page, join(outDir, `${label}-fouc-${tag}-300ms.png`));

  await nav;
  await page.waitForLoadState("domcontentloaded");
  try {
    await page.waitForFunction(
      () => performance.getEntriesByName("first-contentful-paint").length > 0,
      { timeout: 15_000 },
    );
  } catch {
    /* paint entry may be missing in headless; still capture post-DOM */
  }
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
  await shot(page, join(outDir, `${label}-fouc-${tag}-fcp.png`));

  await context.close();
}

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  await captureViewport(browser, { width: 1440, height: 900 }, "1440");
  await captureViewport(browser, { width: 390, height: 844 }, "390");
} finally {
  await browser.close();
}
