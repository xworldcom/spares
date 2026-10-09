/* eslint-disable @typescript-eslint/no-require-imports */
const { h, finishAndExit } = require("./common.cjs");
const {
  waitScrubSettle,
  readActiveQuoteStatus,
  assertSwipeDirectionGuard,
  sectionTitleInView,
  mediumTouchSwipe,
} = require("./gesture-lib.cjs");

const VIEWPORT = { width: 390, height: 844 };

async function reachStatus(page, status) {
  for (let i = 0; i < 48; i += 1) {
    if ((await readActiveQuoteStatus(page)) === status) {
      return true;
    }
    await mediumTouchSwipe(page, VIEWPORT, 1, null, `reach ${status}`);
    await waitScrubSettle(page, 2800);
  }
  return (await readActiveQuoteStatus(page)) === status;
}

(async () => {
  h.checks.length = 0;
  const run = await h.launch({
    name: "phone-390-direction",
    viewport: VIEWPORT,
    mobile: true,
  });
  const { page } = run;
  try {
    await page.goto(`${h.BASE}/`, { waitUntil: "networkidle" });
    await page.waitForSelector(".landing-demo-scrub[data-hydrated='1']", { timeout: 30000 });

    await assertSwipeDirectionGuard(page, VIEWPORT, 1, h, "390 intro swipe down");
    await reachStatus(page, "pricing");
    await assertSwipeDirectionGuard(page, VIEWPORT, -1, h, "390 pricing swipe up");
    await reachStatus(page, "confirmed");
    await assertSwipeDirectionGuard(page, VIEWPORT, -1, h, "390 confirmed swipe up");
    await assertSwipeDirectionGuard(page, VIEWPORT, 1, h, "390 confirmed swipe down");

    const schematic = await sectionTitleInView(page, "#machine-model", VIEWPORT.height);
    if (!schematic.ok) {
      for (let i = 0; i < 8; i += 1) {
        await mediumTouchSwipe(page, VIEWPORT, 1, null, `390 toward schematic ${i + 1}`);
        await waitScrubSettle(page, 2800);
        const view = await sectionTitleInView(page, "#machine-model", VIEWPORT.height);
        if (view.ok) {
          break;
        }
      }
    }
    const finalSchematic = await sectionTitleInView(page, "#machine-model", VIEWPORT.height);
    h.check("390 reaches schematic stop", finalSchematic.ok, JSON.stringify(finalSchematic));

    await page.screenshot({ path: h.path.join(h.OUT, `${h.TAG}-phone-390-direction.png`) });
  } catch (e) {
    console.error(e);
    h.check("phone 390 direction script completed", false, String(e).split("\n")[0]);
  } finally {
    await finishAndExit(run);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
