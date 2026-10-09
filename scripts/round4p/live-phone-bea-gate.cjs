/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Bea phone gate on production — records video per viewport.
 * Usage: LIVE_BASE=https://oee360.com node scripts/round4p/live-phone-bea-gate.cjs
 */
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const round4l = require("../round4l/gesture-lib.cjs");
const { mediumTouchSwipe, waitScrubSettle, readActiveQuoteStatus } = round4l;

const BASE = (process.env.LIVE_BASE ?? "https://oee360.com").replace(/\/$/, "");
const OUT = process.env.R4P_OUT ?? "/cursor/stores/self/media/round4p";
const TIMEOUT = Number(process.env.BEA_GATE_TIMEOUT_MS ?? 55_000);

fs.mkdirSync(OUT, { recursive: true });

const results = [];
const log = (id, ok, detail) => {
  results.push({ id, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${id} ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
};

async function phoneGate(width, label) {
  const viewport = { width, height: width <= 320 ? 568 : 844 };
  const videoDir = path.join(OUT, `${label}-capture`);
  fs.mkdirSync(videoDir, { recursive: true });

  const browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN ?? "/usr/local/bin/google-chrome",
    headless: true,
  });
  const context = await browser.newContext({
    viewport,
    isMobile: true,
    hasTouch: true,
    recordVideo: { dir: videoDir, size: viewport },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(TIMEOUT);

  try {
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
    await page.waitForSelector(".landing-demo-scrub[data-hydrated='1']", { timeout: TIMEOUT });

    const order = round4l.ORDERED_STATUSES;
    const seen = [];
    for (let i = 0; i < 36; i += 1) {
      const status = await readActiveQuoteStatus(page);
      if (!seen.includes(status)) seen.push(status);
      if (status === "confirmed") break;
      await mediumTouchSwipe(page, viewport, 1, null, `${label}-beat-${i}`);
      await waitScrubSettle(page, 2200);
    }
    log(`${label}-swipe-every-beat`, seen.length >= 4, seen.join("→"));

    const status = await readActiveQuoteStatus(page);
    log(`${label}-touch-confirmed`, status === "confirmed", status);

    const y0 = await page.evaluate(() => window.scrollY);
    await mediumTouchSwipe(page, viewport, 1, null, `${label}-past-hold`);
    await waitScrubSettle(page, 2200);
    const y1 = await page.evaluate(() => window.scrollY);
    log(`${label}-swipe-past-hold`, y1 > y0 + 40, `${y0}→${y1}`);

    const idleStartY = await page.evaluate(() => window.scrollY);
    const idleStartStatus = await readActiveQuoteStatus(page);
    await page.waitForTimeout(15_000);
    const idleEndY = await page.evaluate(() => window.scrollY);
    const idleEndStatus = await readActiveQuoteStatus(page);
    log(`${label}-idle-15s-scroll`, Math.abs(idleEndY - idleStartY) <= 3, `${idleStartY}→${idleEndY}`);
    log(`${label}-idle-15s-status`, idleEndStatus === idleStartStatus, `${idleStartStatus}→${idleEndStatus}`);

    for (let i = 0; i < 28; i += 1) {
      const y = await page.evaluate(() => window.scrollY);
      if (y <= 4) break;
      await mediumTouchSwipe(page, viewport, -1, null, `${label}-hero-${i}`);
      await waitScrubSettle(page, 2000);
    }
    const heroY = await page.evaluate(() => window.scrollY);
    log(`${label}-hero-escape`, heroY <= 80, `scrollY=${heroY}`);

    const beforeFirst = await page.evaluate(() => window.scrollY);
    await mediumTouchSwipe(page, viewport, 1, null, `${label}-first-swipe`);
    await waitScrubSettle(page, 2000);
    const afterFirst = await page.evaluate(() => window.scrollY);
    const rail = await page.evaluate(
      () => document.querySelector(".landing-demo-scrub")?.dataset.landingStopRail ?? "",
    );
    const firstY =
      Number(rail.match(/preHandoff:(\d+)/)?.[1]) ||
      Number(rail.match(/beat:(\d+)/)?.[1]) ||
      1200;
    log(
      `${label}-hero-first-swipe`,
      afterFirst > beforeFirst && afterFirst <= firstY + 48,
      `${beforeFirst}→${afterFirst} (rail≤${firstY})`,
    );
  } catch (e) {
    log(`${label}-script-error`, false, String(e).split("\n")[0]);
  } finally {
    await context.close();
    await browser.close();
    const webm = fs.readdirSync(videoDir).find((f) => f.endsWith(".webm"));
    if (webm) {
      const dest = path.join(OUT, `${label}-bea-live.webm`);
      fs.renameSync(path.join(videoDir, webm), dest);
      console.log(`Video ${label}: ${dest}`);
    }
    fs.rmSync(videoDir, { recursive: true, force: true });
  }
}

(async () => {
  console.log(`Bea live phone gate → ${BASE}`);
  await phoneGate(320, "320");
  await phoneGate(390, "390");
  const failed = results.filter((r) => !r.ok);
  const summary = {
    base: BASE,
    elapsedMs: Date.now(),
    pass: results.length - failed.length,
    fail: failed.length,
    results,
  };
  fs.writeFileSync(path.join(OUT, "live-phone-bea-gate.json"), JSON.stringify(summary, null, 2));
  console.log(`\nGATE ${failed.length ? "FAIL" : "PASS"} (${summary.pass}/${results.length})`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
