/* eslint-disable @typescript-eslint/no-require-imports */
const { h, finishAndExit } = require("./common.cjs");
const {
  waitScrubSettle,
  readStatus,
  beatFromStatus,
  realGestureSweep,
  assertSnapStopAlways,
  assertChipNowrapAtBeats,
} = require("./gesture-lib.cjs");

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
];

async function exerciseViewport(page, viewport) {
  const layout = await page.evaluate(() => {
    const snapType = getComputedStyle(document.documentElement).scrollSnapType;
    const beatTracks = document.querySelectorAll(".landing-demo-beat-track").length;
    return { snapType, beatTracks };
  });
  h.check(`${viewport.width}: beat tracks present`, layout.beatTracks === 6, String(layout.beatTracks));
  h.check(`${viewport.width}: mandatory vertical snap`, /mandatory/i.test(layout.snapType), layout.snapType);

  await assertSnapStopAlways(page, h);

  const storyTop = await page.evaluate(() => {
    const section = document.querySelector(".landing-demo-scrub");
    return section.getBoundingClientRect().top + window.scrollY;
  });
  await page.evaluate((y) => window.scrollTo(0, y), storyTop);
  await waitScrubSettle(page);

  const handoffEntryY = await page.evaluate(() => {
    const first = document.querySelector('.landing-demo-beat-track[data-quote-status="requested"]');
    return first ? first.getBoundingClientRect().top + window.scrollY : window.scrollY;
  });
  await page.evaluate((y) => window.scrollTo(0, y), handoffEntryY);
  await waitScrubSettle(page);
  const entryStatus = await readStatus(page);
  h.check(`${viewport.width}: handoff at Requested`, beatFromStatus(entryStatus) === "requested", entryStatus.label);

  await realGestureSweep(page, layout, {
    h,
    name: `${viewport.width} fast-fling-down`,
    direction: 1,
    fast: true,
    steps: 9,
    viewport,
  });

  await realGestureSweep(page, layout, {
    h,
    name: `${viewport.width} fast-fling-up`,
    direction: -1,
    fast: true,
    steps: 8,
    viewport,
  });

  await page.evaluate((y) => window.scrollTo(0, y), handoffEntryY);
  await waitScrubSettle(page);

  await realGestureSweep(page, layout, {
    h,
    name: `${viewport.width} medium-swipe-down`,
    direction: 1,
    fast: false,
      steps: 7,
    viewport,
  });

    await realGestureSweep(page, layout, {
      h,
      name: `${viewport.width} medium-swipe-up`,
      direction: -1,
      fast: false,
      steps: 16,
      viewport,
    });

    await assertChipNowrapAtBeats(page, h);

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
