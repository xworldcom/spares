/* eslint-disable @typescript-eslint/no-require-imports */
const { h, finishAndExit } = require("./common.cjs");
const {
  assertBeatTracksJsOwned,
  assertStepperFitsViewport,
  assertMediumSwipePastConfirmed,
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
  h.check(`${viewport.width}: mandatory vertical snap on page`, /mandatory/i.test(layout.snapType), layout.snapType);

  await assertBeatTracksJsOwned(page, h);
  await assertStepperFitsViewport(page, h, viewport.width);
  await assertMediumSwipePastConfirmed(page, viewport, h);
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
      await page.screenshot({
        path: h.path.join(h.OUT, `${h.TAG}-phone-${viewport.width}.png`),
      });
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
