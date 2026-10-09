/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Headed Chrome Bea gate + video (Top on scroll-down + click hero).
 * Usage: LIVE_BASE=https://oee360.com node scripts/round4q/chrome-bea-gate.cjs
 */
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const q4 = require("./gate-assertions.cjs");

const BASE = (process.env.LIVE_BASE ?? process.env.PREVIEW_BASE ?? "").replace(/\/$/, "");
const OUT = process.env.R4Q_OUT ?? "/cursor/stores/self/media/round4q";
const TIMEOUT = Number(process.env.BEA_GATE_TIMEOUT_MS ?? 55_000);
const HEADLESS = process.env.BEA_CHROME_HEADLESS === "1";

if (!BASE) {
  console.error("LIVE_BASE or PREVIEW_BASE required");
  process.exit(2);
}

fs.mkdirSync(OUT, { recursive: true });

const results = [];
const log = (id, ok, detail) => {
  results.push({ id, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${id} ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
};

async function recordScenario(name, width, height, mobile, fn) {
  const videoDir = path.join(OUT, `${name}-capture`);
  fs.mkdirSync(videoDir, { recursive: true });
  const browser = await chromium.launch({
    channel: "chrome",
    headless: HEADLESS,
    args: [`--window-size=${width},${height}`],
    executablePath: process.env.CHROME_BIN,
  });
  const context = await browser.newContext({
    viewport: { width, height },
    isMobile: mobile,
    hasTouch: mobile,
    recordVideo: { dir: videoDir, size: { width, height } },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(TIMEOUT);
  try {
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
    await page.waitForSelector(".landing-demo-scrub[data-hydrated='1']", { timeout: TIMEOUT });
    await fn(page, width);
  } catch (e) {
    log(`${name}-error`, false, String(e).split("\n")[0]);
  } finally {
    await context.close();
    await browser.close();
    const webm = fs.readdirSync(videoDir).find((f) => f.endsWith(".webm"));
    if (webm) {
      const dest = path.join(OUT, `${name}.webm`);
      fs.renameSync(path.join(videoDir, webm), dest);
      console.log(`Video: ${dest}`);
    }
    fs.rmSync(videoDir, { recursive: true, force: true });
  }
}

(async () => {
  console.log(`Chrome Bea gate → ${BASE} (headless=${HEADLESS})`);
  await recordScenario("top-scroll-down-1280", 1280, 900, false, async (page) => {
    const topDown = await q4.assertTopVisibleScrollDown(page);
    log("chrome-top-visible-scroll-down", topDown.ok, topDown);
  });

  await recordScenario("top-click-320", 320, 568, true, async (page, width) => {
    const inner = await page.evaluate(() => window.innerWidth);
    log("chrome-320-inner-width", inner === width, `innerWidth=${inner}`);
    const click = await q4.assertTopClickReachesHero(page);
    log("chrome-320-top-click-hero", click.ok, click);
  });

  await recordScenario("top-click-375", 375, 812, true, async (page, width) => {
    const inner = await page.evaluate(() => window.innerWidth);
    log("chrome-375-inner-width", inner === width, `innerWidth=${inner}`);
    const click = await q4.assertTopClickReachesHero(page);
    log("chrome-375-top-click-hero", click.ok, click);
  });

  await recordScenario("tray-375", 375, 812, true, async (page, width) => {
    const inner = await page.evaluate(() => window.innerWidth);
    log("chrome-375-tray-inner-width", inner === width, `innerWidth=${inner}`);
    const tray = await q4.assertTrayQtyNotUnderTop(page);
    log("chrome-375-tray-qty-not-top", tray.ok, tray);
  });

  await recordScenario("wheel-390", 390, 844, false, async (page, width) => {
    const inner = await page.evaluate(() => window.innerWidth);
    log("chrome-390-inner-width", inner === width, `innerWidth=${inner}`);
    const wheel = await q4.assertWheelLandsSchematic(page);
    log("chrome-390-wheel-schematic", wheel.ok, wheel);
  });

  const failed = results.filter((r) => !r.ok);
  fs.writeFileSync(
    path.join(OUT, "chrome-bea-gate.json"),
    JSON.stringify({ base: BASE, pass: results.length - failed.length, fail: failed.length, results }, null, 2),
  );
  console.log(`\nGATE ${failed.length ? "FAIL" : "PASS"} (${results.length - failed.length}/${results.length})`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
