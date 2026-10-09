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

async function scrollUntilQuoteTray(page, maxSteps = 72) {
  for (let i = 0; i < maxSteps; i += 1) {
    const open = await page.evaluate(() => {
      const focus = document.querySelector(".landing-workflow-stage.is-quote-focus");
      const sheet = document.querySelector(".landing-workflow-quote-sheet");
      return Boolean(focus) || (sheet?.getBoundingClientRect().height ?? 0) > 24;
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
  const stops = await page.evaluate(() => {
    const rail = document.querySelector(".landing-demo-scrub")?.dataset.landingStopRail ?? "";
    return rail
      .split("|")
      .filter(Boolean)
      .map((part) => {
        const idx = part.lastIndexOf(":");
        return { kind: part.slice(0, idx), scrollY: Number(part.slice(idx + 1)) };
      });
  });
  const holdY = stops.find((s) => s.kind === "confirmedHold")?.scrollY ?? NaN;
  const schY = stops.find((s) => s.kind === "schematic")?.scrollY ?? NaN;
  for (let i = 0; i < 56; i += 1) {
    const y = await page.evaluate(() => window.scrollY);
    if (Number.isFinite(holdY) && y >= holdY - 4) break;
    await page.keyboard.press("PageDown");
    await waitScrubSettle(page, 1400);
  }
  const before = await page.evaluate(() => window.scrollY);
  if (!Number.isFinite(holdY) || before < holdY - 48) {
    return { ok: false, before, after: before, schY, holdY, reason: "not-at-hold" };
  }
  const beatTrack = await page.evaluate(
    () =>
      document.querySelector(".landing-demo-beat-track")?.offsetHeight ?? 56,
  );
  const wheelDelta = Math.max(48, Math.round(beatTrack / 5));
  await page.mouse.wheel(0, wheelDelta);
  await page.waitForTimeout(420);
  await waitScrubSettle(page, 2800);
  const after = await page.evaluate(() => window.scrollY);
  return {
    ok:
      Number.isFinite(schY) &&
      Math.abs(after - schY) <= 2 &&
      Math.abs(before - holdY) <= 48 &&
      after > before + 20,
    before,
    after,
    schY,
    holdY,
  };
}

function readTopButtonMetrics(page) {
  return page.evaluate(() => {
    const btn = document.querySelector(".landing-back-to-top");
    if (!btn) {
      return null;
    }
    const cs = getComputedStyle(btn);
    return {
      active: btn.classList.contains("is-visible"),
      dataActive: btn.getAttribute("data-landing-btt-active") === "1",
      opacity: Number.parseFloat(cs.opacity),
      pointerEvents: cs.pointerEvents,
      visibility: cs.visibility,
      inert: Boolean(btn.inert),
      tabIndex: btn.tabIndex,
      ariaHidden: btn.getAttribute("aria-hidden"),
    };
  });
}

async function assertTopInteractionConsistent(page, targetScrollY) {
  for (let i = 0; i < 40; i += 1) {
    const y = await page.evaluate(() => window.scrollY);
    if (y >= targetScrollY - 24) break;
    await page.keyboard.press("PageDown");
    await waitScrubSettle(page, 1400);
  }
  const m = await readTopButtonMetrics(page);
  if (!m) {
    return { ok: false, reason: "no-button" };
  }
  const tappable =
    m.active &&
    m.dataActive &&
    m.opacity >= 0.95 &&
    m.pointerEvents === "auto" &&
    m.visibility === "visible" &&
    !m.inert &&
    m.tabIndex >= 0;
  const hiddenOk =
    !m.active &&
    m.opacity <= 0.05 &&
    m.pointerEvents === "none" &&
    m.inert;
  return {
    ok: tappable || hiddenOk,
    scrollY: await page.evaluate(() => window.scrollY),
    metrics: m,
  };
}

async function assertTopHideReleasesFocus(page) {
  await pageUpToHero(page);
  await pageDownPastFirstBeat(page);
  const visible = await isTopVisible(page);
  if (!visible) {
    return { ok: false, reason: "top-not-visible-for-focus-test" };
  }
  await page.focus(".landing-back-to-top.is-visible");
  let trayOpen = false;
  for (let i = 0; i < 28; i += 1) {
    trayOpen = await page.evaluate(() => {
      const focus = document.querySelector(".landing-workflow-stage.is-quote-focus");
      const sheet = document.querySelector(".landing-workflow-quote-sheet");
      return Boolean(focus) || (sheet?.getBoundingClientRect().height ?? 0) > 24;
    });
    if (trayOpen) break;
    await page.keyboard.press("PageUp");
    await waitScrubSettle(page, 1400);
  }
  if (!trayOpen) {
    return { ok: false, reason: "tray-never-opened" };
  }
  try {
    await page.waitForFunction(
      () => {
        const btn = document.querySelector(".landing-back-to-top");
        return btn && btn.inert && !btn.classList.contains("is-visible");
      },
      undefined,
      { timeout: 8000 },
    );
  } catch {
    return { ok: false, reason: "top-did-not-hide-for-tray" };
  }
  const m = await readTopButtonMetrics(page);
  const active = await page.evaluate(() => {
    const btn = document.querySelector(".landing-back-to-top");
    return {
      activeEl: document.activeElement?.className ?? "",
      isBtn: document.activeElement === btn,
    };
  });
  return {
    ok:
      m &&
      m.inert &&
      !m.active &&
      m.pointerEvents === "none" &&
      !active.isBtn &&
      m.ariaHidden === null,
    metrics: m,
    active,
  };
}

module.exports = {
  pageUpToHero,
  pageDownPastFirstBeat,
  assertTopVisibleScrollDown,
  assertTopClickReachesHero,
  assertTrayQtyNotUnderTop,
  assertWheelLandsSchematic,
  assertTopInteractionConsistent,
  assertTopHideReleasesFocus,
  readTopButtonMetrics,
  waitScrubSettle,
  readActiveQuoteStatus,
};
