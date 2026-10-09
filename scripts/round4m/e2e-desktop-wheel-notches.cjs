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
  await waitScrubSettle(page, 1600);
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

async function wheelNotchesPastConfirmed(page, notches, trackHeight, height, h, label) {
  const delta = Math.max(8, Math.round(trackHeight / notches));
  const startY = await page.evaluate(() => window.scrollY);
  const startStatus = await readActiveQuoteStatus(page);
  h.check(`${label} starts on Confirmed`, startStatus === "confirmed", startStatus);
  const maxY = await page.evaluate(() => {
    const el = document.scrollingElement ?? document.documentElement;
    return el.scrollHeight - window.innerHeight;
  });
  for (let i = 0; i < 96; i += 1) {
    const box = await page.locator(".landing-site-footer-link").boundingBox();
    if (box && box.y >= 0 && box.y + box.height <= height + 4) {
      break;
    }
    const y = await page.evaluate(() => window.scrollY);
    if (y >= maxY - 12) {
      break;
    }
    await page.mouse.wheel(0, delta);
    await page.waitForTimeout(120);
  }
  await waitScrubSettle(page, 3200);
  const endY = await page.evaluate(() => window.scrollY);
  h.check(`${label} scrollY advanced`, endY > startY + 80, `start=${startY} end=${endY}`);
  h.check(`${label} reached footer scroll depth`, endY >= maxY - 48, `end=${endY} max=${maxY}`);
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
    await page.goto(`${h.BASE}/`, { waitUntil: "domcontentloaded" });
    await waitScrubHydrated(page);

    await assertWheelCannotSkipBeats(page, h, height);

    for (const notches of [1, 3, 5]) {
      await page.goto(`${h.BASE}/`, { waitUntil: "domcontentloaded" });
      await waitScrubHydrated(page);
      const trackHeight = await page.evaluate(() => {
        const track = document.querySelector(".landing-demo-beat-track");
        return track?.offsetHeight ?? 420;
      });
      await reachConfirmed(page, h);
      await wheelNotchesPastConfirmed(
        page,
        notches,
        trackHeight,
        height,
        h,
        `${notches}-notch wheel down`,
      );
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
