/* eslint-disable @typescript-eslint/no-require-imports */
const { h, finishAndExit } = require("./common.cjs");
const {
  waitScrubSettle,
  readActiveQuoteStatus,
  realGestureBeatTour,
  assertSnapStopAlways,
  assertStepperFitsViewport,
} = require("./gesture-lib.cjs");

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
];

async function readScrubProgress(page) {
  return page.evaluate(() => {
    const scrub = document.querySelector(".landing-demo-scrub");
    return Number.parseFloat(scrub?.dataset.progress ?? "0");
  });
}

async function scrollToHandoffWithGestures(page, viewport, h, label) {
  const cx = Math.round(viewport.width / 2);
  const cy = Math.round(viewport.height * 0.62);
  let progress = await readScrubProgress(page);
  let status = await readActiveQuoteStatus(page);
  for (let i = 0; i < 36; i += 1) {
    if (progress >= 0.43 && progress <= 0.54 && status === "requested") {
      break;
    }
    const client = await page.context().newCDPSession(page);
    const distance = Math.round(viewport.height * 0.72);
    const yStart = cy + distance * 0.35;
    const yEnd = cy - distance * 0.65;
    const steps = 12;
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: cx, y: yStart }],
    });
    for (let s = 1; s <= steps; s += 1) {
      const t = s / steps;
      await client.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: cx, y: yStart + (yEnd - yStart) * t }],
      });
      await page.waitForTimeout(14);
    }
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await waitScrubSettle(page);
    progress = await readScrubProgress(page);
    status = await readActiveQuoteStatus(page);
  }
  h.check(`${label}: reached handoff via gestures`, progress >= 0.425 && progress <= 0.54, progress.toFixed(3));
  h.check(`${label}: handoff at Requested`, status === "requested", String(status));
}

async function exerciseViewport(page, viewport) {
  const layout = await page.evaluate(() => {
    const snapType = getComputedStyle(document.documentElement).scrollSnapType;
    const beatTracks = document.querySelectorAll(".landing-demo-beat-track").length;
    return { snapType, beatTracks };
  });
  h.check(`${viewport.width}: beat tracks present`, layout.beatTracks === 6, String(layout.beatTracks));
  h.check(`${viewport.width}: mandatory vertical snap`, /mandatory/i.test(layout.snapType), layout.snapType);

  await assertSnapStopAlways(page, h);
  await scrollToHandoffWithGestures(page, viewport, h, `${viewport.width}`);
  await assertStepperFitsViewport(page, h, viewport.width);

  await realGestureBeatTour(page, {
    h,
    name: `${viewport.width} medium-swipe-down`,
    direction: 1,
    gestures: 14,
    viewport,
  });

  await realGestureBeatTour(page, {
    h,
    name: `${viewport.width} medium-swipe-up`,
    direction: -1,
    gestures: 14,
    viewport,
  });

  await scrollToHandoffWithGestures(page, viewport, h, `${viewport.width}-fling-reset`);
  await realGestureBeatTour(page, {
    h,
    name: `${viewport.width} fling-down`,
    direction: 1,
    gestures: 10,
    viewport,
    fling: true,
  });

  await page.screenshot({
    path: h.path.join(h.OUT, `${h.TAG}-phone-${viewport.width}-beats.png`),
  });
}

(async () => {
  h.checks.length = 0;
  const run = await h.launch({
    name: "phone-landing-gestures",
    viewport: VIEWPORTS[0],
    mobile: true,
  });
  const { page } = run;
  try {
    await page.goto(`${h.BASE}/`, { waitUntil: "networkidle" });
    await page.locator(".landing-demo-scrub").first().waitFor({ state: "attached", timeout: 30000 });
    await page.waitForSelector(".landing-demo-scrub[data-hydrated='1']", { timeout: 30000 });

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForSelector(".landing-demo-scrub[data-hydrated='1']", { timeout: 30000 });
      await page.evaluate(() => window.scrollTo(0, 0));
      await waitScrubSettle(page, 3200);
      await exerciseViewport(page, viewport);
    }
  } catch (e) {
    console.error(e);
    h.check("phone gestures script completed", false, String(e).split("\n")[0]);
  } finally {
    await finishAndExit(run);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
