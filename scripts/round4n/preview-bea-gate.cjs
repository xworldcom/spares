/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Bea v15 preview gate — bounded timeouts, always prints JSON summary.
 * Usage: PREVIEW_BASE=https://... node scripts/round4n/preview-bea-gate.cjs
 */
const { chromium } = require("playwright");
const round4l = require("../round4l/gesture-lib.cjs");
const { mediumTouchSwipe, waitScrubSettle, readActiveQuoteStatus } = round4l;
const q4 = require("../round4q/gate-assertions.cjs");

const BASE = (process.env.PREVIEW_BASE ?? "").replace(/\/$/, "");
const OUT = process.env.R4_OUT ?? "/cursor/stores/self/media/round4n";
const TIMEOUT = Number(process.env.BEA_GATE_TIMEOUT_MS ?? 45_000);

if (!BASE) {
  console.error("PREVIEW_BASE required");
  process.exit(2);
}

const results = [];
const log = (id, ok, detail) => {
  results.push({ id, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${id} ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
};

async function withPage(viewport, mobile, fn) {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN ?? "/usr/local/bin/google-chrome",
    headless: true,
  });
  const page = await browser.newPage({
    viewport,
    isMobile: mobile,
    hasTouch: mobile,
  });
  page.setDefaultTimeout(TIMEOUT);
  try {
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
    await page.waitForSelector(".landing-demo-scrub[data-hydrated='1']", { timeout: TIMEOUT });
    return await fn(page);
  } finally {
    await browser.close();
  }
}

async function desktopGate() {
  await withPage({ width: 1280, height: 900 }, false, async (page) => {
    for (let i = 0; i < 24; i += 1) {
      const y = await page.evaluate(() => window.scrollY);
      if (y <= 0) break;
      await page.keyboard.press("PageUp");
      await waitScrubSettle(page, 2000);
    }
    const heroY = await page.evaluate(() => window.scrollY);
    log("desktop-pageup-hero", heroY <= 4, `scrollY=${heroY}`);

    const stops = [];
    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press("PageDown");
      await waitScrubSettle(page, 1800);
      stops.push(await page.evaluate(() => window.scrollY));
    }
    const monotonic = stops.every((y, i) => i === 0 || y >= stops[i - 1] - 2);
    log("desktop-pagedown-monotonic", monotonic, stops.join("→"));

    const rail = await page.evaluate(() => document.querySelector(".landing-demo-scrub")?.dataset.landingStopRail ?? "");
    const holdMatch = rail.match(/confirmedHold:(\d+)/);
    const schMatch = rail.match(/schematic:(\d+)/);
    const holdY = holdMatch ? Number(holdMatch[1]) : null;
    const schY = schMatch ? Number(schMatch[1]) : null;
    for (let i = 0; i < 48; i += 1) {
      const y = await page.evaluate(() => window.scrollY);
      if (holdY !== null && y >= holdY - 4) break;
      await page.keyboard.press("PageDown");
      await waitScrubSettle(page, 1600);
    }
    const yHold = await page.evaluate(() => window.scrollY);
    await page.keyboard.press("PageDown");
    await waitScrubSettle(page, 2000);
    const ySch = await page.evaluate(() => window.scrollY);
    log(
      "desktop-pagedown-schematic",
      holdY !== null &&
        schY !== null &&
        yHold >= holdY - 4 &&
        ySch === schY &&
        ySch > yHold + 40,
      { yHold, holdY, ySch, schY },
    );

    for (let i = 0; i < 32; i += 1) {
      const y = await page.evaluate(() => window.scrollY);
      if (y <= 4) break;
      await page.keyboard.press("PageUp");
      await waitScrubSettle(page, 1800);
    }
    const railStops = await page.evaluate(() => {
      const rail = document.querySelector(".landing-demo-scrub")?.dataset.landingStopRail ?? "";
      return rail
        .split("|")
        .filter(Boolean)
        .map((part) => {
          const idx = part.lastIndexOf(":");
          return { kind: part.slice(0, idx), scrollY: Number(part.slice(idx + 1)) };
        });
    });
    const landedYs = [];
    let railOk = true;
    for (let i = 0; i < Math.min(railStops.length, 24); i += 1) {
      if (i > 0) {
        await page.keyboard.press("PageDown");
        await waitScrubSettle(page, 1800);
      }
      const y = await page.evaluate(() => window.scrollY);
      landedYs.push(y);
      const expected = railStops[i]?.scrollY;
      if (expected !== undefined && y !== expected) {
        railOk = false;
      }
    }
    log("desktop-rail-landed-y", railOk, { railStops: railStops.slice(0, 12), landedYs });

    for (let i = 0; i < 32; i += 1) {
      const y = await page.evaluate(() => window.scrollY);
      if (y <= 4) break;
      await page.keyboard.press("PageUp");
      await waitScrubSettle(page, 1600);
    }
    for (let i = 0; i < 40; i += 1) {
      const y = await page.evaluate(() => window.scrollY);
      const rail = await page.evaluate(
        () => document.querySelector(".landing-demo-scrub")?.dataset.landingStopRail ?? "",
      );
      const beat = rail.match(/beat:(\d+)/);
      if (beat && y >= Number(beat[1]) - 8) break;
      await page.keyboard.press("PageDown");
      await waitScrubSettle(page, 1600);
    }
    const topVisible = await page.evaluate(() =>
      document.querySelector(".landing-back-to-top")?.classList.contains("is-visible"),
    );
    log("desktop-back-to-top-visible", topVisible === true, String(topVisible));

    for (let i = 0; i < 32; i += 1) {
      const y = await page.evaluate(() => window.scrollY);
      if (y <= 4) break;
      await page.keyboard.press("PageUp");
      await waitScrubSettle(page, 1500);
    }
    for (let i = 0; i < 40; i += 1) {
      if ((await readActiveQuoteStatus(page)) === "requested") break;
      await page.keyboard.press("PageDown");
      await waitScrubSettle(page, 1200);
    }
    const beforeWheel = await readActiveQuoteStatus(page);
    await page.mouse.wheel(0, 40);
    await page.waitForTimeout(450);
    await waitScrubSettle(page, 2000);
    const afterWheel = await readActiveQuoteStatus(page);
    const order = round4l.ORDERED_STATUSES;
    const skipped = order.indexOf(afterWheel) - order.indexOf(beforeWheel);
    log("desktop-wheel-one-notch", skipped <= 1, `${beforeWheel}→${afterWheel} Δindex=${skipped}`);

    const topDown = await q4.assertTopVisibleScrollDown(page);
    log("desktop-top-visible-scroll-down", topDown.ok, topDown);
  });
}

async function topClickGate(width, label) {
  const viewport = { width, height: width <= 320 ? 568 : 844 };
  await withPage(viewport, true, async (page) => {
    const inner = await page.evaluate(() => window.innerWidth);
    log(`${label}-inner-width`, inner === width, `innerWidth=${inner}`);
    const click = await q4.assertTopClickReachesHero(page);
    log(`${label}-top-click-hero`, click.ok, click);
  });
}

async function trayGate(width, label) {
  const viewport = { width, height: width <= 320 ? 568 : 812 };
  await withPage(viewport, true, async (page) => {
    const inner = await page.evaluate(() => window.innerWidth);
    log(`${label}-tray-inner-width`, inner === width, `innerWidth=${inner}`);
    const tray = await q4.assertTrayQtyNotUnderTop(page);
    log(`${label}-tray-qty-not-top`, tray.ok, tray);
  });
}

async function wheel390Gate() {
  await withPage({ width: 390, height: 844 }, false, async (page) => {
    const inner = await page.evaluate(() => window.innerWidth);
    log("390-inner-width", inner === 390, `innerWidth=${inner}`);
    const wheelSch = await q4.assertWheelLandsSchematic(page);
    log("390-viewport-wheel-schematic", wheelSch.ok, wheelSch);
  });
}

async function phoneGate(width, label) {
  const viewport = { width, height: width <= 320 ? 568 : 844 };
  await withPage(viewport, true, async (page) => {
    for (let i = 0; i < 36; i += 1) {
      if ((await readActiveQuoteStatus(page)) === "confirmed") break;
      await mediumTouchSwipe(page, viewport, 1, null, `${label}-reach-confirmed-${i}`);
      await waitScrubSettle(page, 2200);
    }
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
  });
}

(async () => {
  const started = Date.now();
  console.log(`Bea preview gate → ${BASE}`);
  try {
    await desktopGate();
    await wheel390Gate();
    await topClickGate(320, "320");
    await topClickGate(375, "375");
    await trayGate(375, "375");
    const mid375 = await withPage({ width: 375, height: 812 }, true, async (page) => {
      return q4.assertTopInteractionConsistent(page, 1175);
    });
    log("375-top-opacity-pointer-sync", mid375.ok, mid375);
    const focus375 = await withPage({ width: 375, height: 812 }, true, async (page) => {
      return q4.assertTopHideReleasesFocus(page);
    });
    log("375-top-inert-on-tray-hide", focus375.ok, focus375);
    await phoneGate(320, "320");
    await phoneGate(390, "390");
  } catch (e) {
    log("gate-script-error", false, String(e).split("\n")[0]);
  }
  const failed = results.filter((r) => !r.ok);
  const summary = {
    base: BASE,
    sha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? process.env.GIT_SHA ?? "local",
    pr: 328,
    elapsedMs: Date.now() - started,
    pass: results.length - failed.length,
    fail: failed.length,
    failedIds: failed.map((r) => r.id),
    results,
  };
  const fs = require("node:fs");
  const path = require("node:path");
  fs.mkdirSync(OUT, { recursive: true });
  const outPath = path.join(OUT, "preview-bea-gate.json");
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log(`\nWrote ${outPath}`);
  const code = failed.length ? 1 : 0;
  console.log(`\nGATE ${code === 0 ? "PASS" : "FAIL"} (${results.length - failed.length}/${results.length})`);
  process.exit(code);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
