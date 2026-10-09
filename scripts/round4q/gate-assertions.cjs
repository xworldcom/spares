/* eslint-disable @typescript-eslint/no-require-imports */
const round4l = require("../round4l/gesture-lib.cjs");
const { waitScrubSettle, readActiveQuoteStatus } = round4l;

async function pageUpToHero(page, maxSteps = 36) {
  for (let i = 0; i < maxSteps; i += 1) {
    const y = await page.evaluate(() => window.scrollY);
    if (y <= 4) break;
    await page.keyboard.press("PageUp");
    await waitScrubSettle(page, 1800);
  }
}

async function pageDownPastFirstBeat(page, maxSteps = 40) {
  for (let i = 0; i < maxSteps; i += 1) {
    const y = await page.evaluate(() => window.scrollY);
    const rail = await page.evaluate(
      () => document.querySelector(".landing-demo-scrub")?.dataset.landingStopRail ?? "",
    );
    const beat = rail.match(/beat:(\d+)/);
    if (beat && y >= Number(beat[1]) - 8) return y;
    await page.keyboard.press("PageDown");
    await waitScrubSettle(page, 1600);
  }
  return page.evaluate(() => window.scrollY);
}

async function pageDownToFooter(page, maxSteps = 48) {
  for (let i = 0; i < maxSteps; i += 1) {
    const y = await page.evaluate(() => window.scrollY);
    const maxY = await page.evaluate(
      () =>
        Math.max(
          0,
          (document.scrollingElement?.scrollHeight ?? 0) - window.innerHeight,
        ),
    );
    if (y >= maxY - 6) return y;
    await page.keyboard.press("PageDown");
    await waitScrubSettle(page, 1600);
  }
  return page.evaluate(() => window.scrollY);
}

async function isTopVisible(page) {
  return page.evaluate(() =>
    document.querySelector(".landing-back-to-top")?.classList.contains("is-visible"),
  );
}

async function assertTopVisibleScrollDown(page) {
  await pageUpToHero(page);
  await pageDownPastFirstBeat(page);
  const mid = await isTopVisible(page);
  await pageDownToFooter(page);
  const footer = await isTopVisible(page);
  return { ok: mid === true && footer === true, mid, footer };
}

async function assertTopClickReachesHero(page) {
  await pageUpToHero(page);
  await pageDownPastFirstBeat(page);
  const visible = await isTopVisible(page);
  if (!visible) {
    return { ok: false, reason: "top-not-visible", scrollY: await page.evaluate(() => window.scrollY) };
  }
  await page.click(".landing-back-to-top.is-visible", { timeout: 8000 });
  await waitScrubSettle(page, 5000);
  const y = await page.evaluate(() => window.scrollY);
  return { ok: y <= 4, scrollY: y };
}

async function scrollUntilQuoteTray(page, maxSteps = 50) {
  for (let i = 0; i < maxSteps; i += 1) {
    const open = await page.evaluate(() => {
      const sheet = document.querySelector(".landing-workflow-quote-sheet");
      return (sheet?.getBoundingClientRect().height ?? 0) > 24;
    });
    if (open) return true;
    await page.keyboard.press("PageDown");
    await waitScrubSettle(page, 1400);
  }
  return false;
}

async function assertTrayQtyNotUnderTop(page) {
  const trayOpen = await scrollUntilQuoteTray(page);
  if (!trayOpen) {
    return { ok: false, reason: "tray-never-opened" };
  }
  const probe = await page.evaluate(() => {
    const qty = document.querySelector(".landing-workflow-quote-qty");
    const btn = document.querySelector(".landing-back-to-top");
    if (!qty) {
      return { ok: false, reason: "no-qty" };
    }
    const rect = qty.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(x, y);
    const hitBtn =
      hit === btn ||
      Boolean(btn && hit instanceof Node && btn.contains(hit));
    const topHidden = !btn?.classList.contains("is-visible");
    return {
      ok: !hitBtn && topHidden,
      hitBtn,
      topHidden,
      hitClass: hit?.className ?? "",
    };
  });
  return probe;
}

async function assertWheelLandsSchematic(page) {
  await pageUpToHero(page);
  const rail = await page.evaluate(
    () => document.querySelector(".landing-demo-scrub")?.dataset.landingStopRail ?? "",
  );
  const holdY = Number(rail.match(/confirmedHold:(\d+)/)?.[1] ?? NaN);
  const schY = Number(rail.match(/schematic:(\d+)/)?.[1] ?? NaN);
  for (let i = 0; i < 48; i += 1) {
    const y = await page.evaluate(() => window.scrollY);
    if (Number.isFinite(holdY) && y >= holdY - 4) break;
    await page.keyboard.press("PageDown");
    await waitScrubSettle(page, 1400);
  }
  for (let i = 0; i < 48; i += 1) {
    const y = await page.evaluate(() => window.scrollY);
    if (Number.isFinite(holdY) && y >= holdY - 4 && y < schY - 4) break;
    await page.keyboard.press("PageDown");
    await waitScrubSettle(page, 1400);
  }
  const before = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 48);
  await page.waitForTimeout(450);
  await waitScrubSettle(page, 2500);
  const after = await page.evaluate(() => window.scrollY);
  return {
    ok: Number.isFinite(schY) && after === schY && after > before,
    before,
    after,
    schY,
  };
}

module.exports = {
  pageUpToHero,
  pageDownPastFirstBeat,
  assertTopVisibleScrollDown,
  assertTopClickReachesHero,
  assertTrayQtyNotUnderTop,
  assertWheelLandsSchematic,
  waitScrubSettle,
  readActiveQuoteStatus,
};
