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
  for (let i = 0; i < 50; i += 1) {
    if (sequence[sequence.length - 1] === target) {
      break;
    }
    await page.keyboard.press(key);
    await waitScrubSettle(page, 2400);
    const status = await readActiveQuoteStatus(page);
    if (!status || status === sequence[sequence.length - 1]) {
      continue;
    }
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

(async () => {
  h.checks.length = 0;
  const run = await h.launch({
    name: "desktop-pagedown",
    viewport: { width: 1440, height: 900 },
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

    await page.keyboard.press("End");
    await waitScrubSettle(page, 3200);
    let footerStatus = await readActiveQuoteStatus(page);
    for (let i = 0; i < 12 && footerStatus !== "confirmed"; i += 1) {
      await page.keyboard.press("PageDown");
      await waitScrubSettle(page, 2200);
      footerStatus = await readActiveQuoteStatus(page);
    }
    h.check("End lands on Confirmed beat", footerStatus === "confirmed", footerStatus);

    await collectHandoffBeatTour(page, "PageUp", -1, h, "desktop PageUp from footer");
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
