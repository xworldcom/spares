/* eslint-disable @typescript-eslint/no-require-imports */
const { h, finishAndExit } = require("./common.cjs");
const {
  assertBeatTracksJsOwned,
  assertStepperFitsViewport,
  assertMediumSwipePastConfirmed,
  sectionTitleInView,
  waitScrubSettle,
  mediumTouchSwipe,
} = require("./gesture-lib.cjs");

const VIEWPORT = { width: 320, height: 568 };

async function swipeToSection(page, viewport, direction, selector, h, label) {
  for (let i = 0; i < 36; i += 1) {
    const view = await sectionTitleInView(page, selector, viewport.height);
    if (view.ok) {
      h.check(label, true, JSON.stringify(view));
      return;
    }
    await mediumTouchSwipe(page, viewport, direction, null, `${label} swipe ${i + 1}`);
    await waitScrubSettle(page, 2800);
  }
  const final = await sectionTitleInView(page, selector, viewport.height);
  h.check(label, final.ok, JSON.stringify(final));
}

(async () => {
  h.checks.length = 0;
  const run = await h.launch({
    name: "phone-landing-gestures",
    viewport: VIEWPORT,
    mobile: true,
  });
  const { page } = run;
  try {
    await page.goto(`${h.BASE}/`, { waitUntil: "networkidle" });
    await page.waitForSelector(".landing-demo-scrub[data-hydrated='1']", { timeout: 30000 });
    await assertBeatTracksJsOwned(page, h);
    await assertStepperFitsViewport(page, h, VIEWPORT.width);
    await assertMediumSwipePastConfirmed(page, VIEWPORT, h);
    await swipeToSection(page, VIEWPORT, 1, "#machine-model", h, "320 swipe down reaches schematic");
    await swipeToSection(page, VIEWPORT, 1, "#cad-ingest", h, "320 swipe down reaches assembly");
    await swipeToSection(page, VIEWPORT, -1, "#machine-model", h, "320 swipe up returns to schematic");
    await page.screenshot({ path: h.path.join(h.OUT, `${h.TAG}-phone-320.png`) });
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
