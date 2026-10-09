/* eslint-disable @typescript-eslint/no-require-imports */
const { h, finishAndExit } = require("./common.cjs");
const { waitScrubSettle, readActiveQuoteStatus } = require("./gesture-lib.cjs");

async function assertIdleStable(page, h, label, durationMs = 30_000) {
  const startY = await page.evaluate(() => window.scrollY);
  const startStatus = await readActiveQuoteStatus(page);
  await page.waitForTimeout(durationMs);
  const endY = await page.evaluate(() => window.scrollY);
  const endStatus = await readActiveQuoteStatus(page);
  h.check(
    `${label}: ${durationMs / 1000}s idle scrollY stable`,
    Math.abs(endY - startY) <= 2,
    `${startY} → ${endY}`,
  );
  h.check(
    `${label}: idle quote status stable`,
    endStatus === startStatus,
    `${startStatus} → ${endStatus}`,
  );
}

async function reachQuoted(page) {
  for (let i = 0; i < 56; i += 1) {
    const status = await readActiveQuoteStatus(page);
    if (status === "quoted") {
      return;
    }
    await page.keyboard.press("PageDown");
    await waitScrubSettle(page, 1600);
  }
}

(async () => {
  h.checks.length = 0;
  const run = await h.launch({
    name: "phone-idle-scroll",
    viewport: { width: 320, height: 568 },
    mobile: true,
  });
  const { page } = run;
  try {
    await page.goto(`${h.BASE}/`, { waitUntil: "networkidle" });
    await page.waitForSelector(".landing-demo-scrub[data-hydrated='1']", { timeout: 30000 });

    await assertIdleStable(page, h, "hero", 30_000);

    for (let i = 0; i < 24; i += 1) {
      const progress = await page.evaluate(() =>
        Number.parseFloat(document.querySelector(".landing-demo-scrub")?.dataset.progress ?? "0"),
      );
      if (progress >= 0.35) {
        break;
      }
      await page.keyboard.press("PageDown");
      await waitScrubSettle(page, 1400);
    }
    await assertIdleStable(page, h, "quote tray", 30_000);

    await reachQuoted(page);
    await assertIdleStable(page, h, "Quoted beat", 30_000);

    await page.screenshot({ path: h.path.join(h.OUT, `${h.TAG}-phone-idle.png`) });
  } catch (e) {
    console.error(e);
    h.check("phone idle script completed", false, String(e).split("\n")[0]);
  } finally {
    await finishAndExit(run);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
