/* eslint-disable @typescript-eslint/no-require-imports */
const { h, finishAndExit } = require("./common.cjs");
const {
  ORDERED_STATUSES,
  waitScrubSettle,
  readActiveQuoteStatus,
  assertMonotonicSequence,
  assertPageUpReachesHero,
  installScrollToDirectionGuard,
  assertNoOppositeScrollTo,
  assertPostHandoffStops,
} = require("./gesture-lib.cjs");

async function readScrubProgress(page) {
  return page.evaluate(() => {
    const scrub = document.querySelector(".landing-demo-scrub");
    return Number.parseFloat(scrub?.dataset.progress ?? "0");
  });
}

async function pageDownUntilHandoffBeat(page, h) {
  let progress = await readScrubProgress(page);
  let status = await readActiveQuoteStatus(page);
  for (let i = 0; i < 48 && progress < 0.455; i += 1) {
    await page.keyboard.press("PageDown");
    await waitScrubSettle(page, 2400);
    progress = await readScrubProgress(page);
    status = await readActiveQuoteStatus(page);
  }
  h.check("PageDown reached handoff beats from hero", progress >= 0.455, progress.toFixed(3));
  if (status === "in_review") {
    await page.keyboard.press("PageUp");
    await waitScrubSettle(page, 2600);
    status = await readActiveQuoteStatus(page);
  }
  h.check("handoff starts on Requested", status === "requested", String(status));
}

async function collectHandoffBeatTour(page, key, direction, h, label) {
  const order = ORDERED_STATUSES;
  const target = direction > 0 ? order.at(-1) : order[0];
  const sequence = [];
  const first = await readActiveQuoteStatus(page);
  if (first) {
    sequence.push(first);
  }
  let stagnant = 0;
  for (let i = 0; i < 50; i += 1) {
    if (sequence[sequence.length - 1] === target) {
      break;
    }
    const yBefore = await page.evaluate(() => window.scrollY);
    await page.keyboard.press(key);
    await waitScrubSettle(page, 2400);
    const yAfter = await page.evaluate(() => window.scrollY);
    const status = await readActiveQuoteStatus(page);
    if (!status || status === sequence[sequence.length - 1]) {
      if (Math.abs(yAfter - yBefore) < 4) {
        stagnant += 1;
        if (stagnant >= 3) {
          break;
        }
      }
      continue;
    }
    stagnant = 0;
    const prev = sequence[sequence.length - 1];
    const prevIdx = order.indexOf(prev);
    const nextIdx = order.indexOf(status);
    if (direction > 0 && nextIdx < prevIdx) {
      h.check(`${label} no backward jump`, false, `${prev} → ${status}`);
      continue;
    }
    if (direction < 0 && nextIdx > prevIdx) {
      h.check(`${label} no forward jump on PageUp`, false, `${prev} → ${status}`);
      continue;
    }
    if (direction > 0 && nextIdx - prevIdx > 1) {
      h.check(`${label} no skipped beat on PageDown`, false, `${prev} → ${status}`);
      continue;
    }
    if (direction < 0 && prevIdx - nextIdx > 1) {
      h.check(`${label} no skipped beat on PageUp`, false, `${prev} → ${status}`);
      continue;
    }
    sequence.push(status);
  }
  for (let extra = 0; extra < 10 && sequence[sequence.length - 1] !== target; extra += 1) {
    await page.keyboard.press(key);
    await waitScrubSettle(page, 2800);
    const status = await readActiveQuoteStatus(page);
    if (status && status !== sequence[sequence.length - 1]) {
      sequence.push(status);
    }
  }
  h.check(`${label} reached ${target}`, sequence[sequence.length - 1] === target, sequence.join(" → "));
  assertMonotonicSequence(h, label, sequence, direction);
  return sequence;
}

async function assertConfirmedEndHoldIsOnePress(page, h) {
  const y0 = await page.evaluate(() => window.scrollY);
  const status0 = await readActiveQuoteStatus(page);
  h.check("end-hold probe on Confirmed", status0 === "confirmed", status0);
  await page.keyboard.press("PageDown");
  await waitScrubSettle(page, 2600);
  const y1 = await page.evaluate(() => window.scrollY);
  const holdY = await page.evaluate(() => {
    const section = document.querySelector(".landing-demo-scrub");
    const pin = section?.querySelector(".landing-demo-scrub-pin");
    if (!section || !pin) {
      return null;
    }
    const sticky = Number.parseFloat(getComputedStyle(pin).top) || 0;
    let sectionDoc = 0;
    for (let node = section; node; node = node.offsetParent) {
      sectionDoc += node.offsetTop;
    }
    return Math.round(sectionDoc + section.offsetHeight - pin.offsetHeight - sticky);
  });
  const holdStop = await page.evaluate(() => {
    const rail = document.querySelector(".landing-demo-scrub")?.dataset.landingStopRail ?? "";
    const match = rail.match(/confirmedHold:(\d+)/);
    return match ? Number(match[1]) : null;
  });
  h.check(
    "Confirmed end-hold is one PageDown (not 7 micro steps)",
    holdStop !== null && Math.abs(y1 - holdStop) <= 48 && y1 - y0 > 120,
    `Δy=${y1 - y0} holdStop=${holdStop} y1=${y1}`,
  );
}

(async () => {
  h.checks.length = 0;
  const height = 900;
  const run = await h.launch({
    name: "desktop-pagedown",
    viewport: { width: 1280, height },
    mobile: false,
  });
  const { page } = run;
  try {
    await installScrollToDirectionGuard(page);
    await page.goto(`${h.BASE}/`, { waitUntil: "networkidle" });
    await page.locator(".landing-demo-scrub").first().waitFor({ state: "attached", timeout: 30000 });
    await page.waitForSelector(".landing-demo-scrub[data-hydrated='1']", { timeout: 30000 });

    await pageDownUntilHandoffBeat(page, h);
    await collectHandoffBeatTour(page, "PageDown", 1, h, "desktop PageDown from Requested");

    h.check(
      "handoff tour ends on Confirmed beat",
      (await readActiveQuoteStatus(page)) === "confirmed",
      await readActiveQuoteStatus(page),
    );

    await assertConfirmedEndHoldIsOnePress(page, h);
    await assertPostHandoffStops(page, h, height);

    for (let i = 0; i < 8; i += 1) {
      const status = await readActiveQuoteStatus(page);
      if (status === "confirmed") {
        break;
      }
      await page.keyboard.press("PageUp");
      await waitScrubSettle(page, 2400);
    }
    await collectHandoffBeatTour(page, "PageUp", -1, h, "desktop PageUp from Confirmed");
    await assertPageUpReachesHero(page, h, "desktop footer");
    await assertNoOppositeScrollTo(page, h, "desktop PageDown/PageUp");

    await page.screenshot({ path: h.path.join(h.OUT, `${h.TAG}-desktop-pagedown.png`) });
  } catch (e) {
    console.error(e);
    h.check("desktop script completed", false, String(e).split("\n")[0]);
  } finally {
    await finishAndExit(run);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
