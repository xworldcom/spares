/* eslint-disable @typescript-eslint/no-require-imports */
const { h, finishAndExit } = require("./common.cjs");
const {
  waitScrubSettle,
  readActiveQuoteStatus,
  installScrollToDirectionGuard,
  assertNoOppositeScrollTo,
  assertWheelCannotSkipBeats,
} = require("./gesture-lib.cjs");

async function waitScrubHydrated(page) {
  await page.locator(".landing-demo-scrub").first().waitFor({ state: "attached", timeout: 30000 });
  await page.waitForSelector(".landing-demo-scrub[data-hydrated='1']", { timeout: 30000 });
}

async function scrollToTop(page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
}

async function reachConfirmed(page, h) {
  await scrollToTop(page);
  for (let i = 0; i < 64; i += 1) {
    const status = await readActiveQuoteStatus(page);
    if (status === "confirmed") {
      await waitScrubSettle(page, 2400);
      return;
    }
    await page.keyboard.press("PageDown");
    await waitScrubSettle(page, 2200);
  }
  const final = await readActiveQuoteStatus(page);
  h.check("reached Confirmed beat", final === "confirmed", final);
}

(async () => {
  h.checks.length = 0;
  const height = 900;
  const run = await h.launch({
    name: "desktop-wheel-notches",
    viewport: { width: 1280, height },
    mobile: false,
  });
  const { page } = run;
  try {
    await installScrollToDirectionGuard(page);
    await page.goto(`${h.BASE}/`, { waitUntil: "networkidle" });
    await waitScrubHydrated(page);

    await assertWheelCannotSkipBeats(page, h, height);

    const trackHeight = await page.evaluate(() => {
      const track = document.querySelector(".landing-demo-beat-track");
      return track?.offsetHeight ?? 420;
    });

    await reachConfirmed(page, h);
    for (const notches of [1, 3, 5]) {
      await reachConfirmed(page, h);
      const delta = Math.max(8, Math.round(trackHeight / notches));
      const startY = await page.evaluate(() => window.scrollY);
      for (let i = 0; i < 24; i += 1) {
        const box = await page.locator(".landing-site-footer-link").boundingBox();
        if (box && box.y >= 0 && box.y + box.height <= height + 4) {
          break;
        }
        await page.mouse.wheel(0, delta);
        await page.waitForTimeout(120);
      }
      await waitScrubSettle(page, 3200);
      const endY = await page.evaluate(() => window.scrollY);
      h.check(`${notches}-notch wheel down advanced`, endY > startY + 40, `start=${startY} end=${endY}`);
      await scrollToTop(page);
    }

    await assertNoOppositeScrollTo(page, h, "desktop wheel suite");
    await page.screenshot({ path: h.path.join(h.OUT, `${h.TAG}-desktop-wheel-notches.png`) });
  } catch (e) {
    console.error(e);
    h.check("desktop wheel script completed", false, String(e).split("\n")[0]);
  } finally {
    await finishAndExit(run);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
