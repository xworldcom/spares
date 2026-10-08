/* eslint-disable @typescript-eslint/no-require-imports */
// v5 phone pin: ~550svh scroll runway; one viewport fling should not skip to handoff.
const { h, finishAndExit } = require("./common.cjs");

const MIN_PIN_SVH = 500;
const MAX_PIN_SVH = 620;

(async () => {
  const run = await h.launch({ name: "phone-landing", viewport: { width: 390, height: 844 }, mobile: true });
  const { page } = run;
  try {
    await page.goto(`${h.BASE}/`, { waitUntil: "networkidle" });
    await page.locator(".landing-demo-scrub").first().waitFor({ state: "attached", timeout: 30000 });
    const pin = await page.evaluate(() => {
      const s = document.querySelector(".landing-demo-scrub");
      const p = document.querySelector(".landing-demo-scrub-pin");
      const vh = window.innerHeight;
      return { distanceSvh: Math.round(((s.offsetHeight - p.offsetHeight) / vh) * 100), vh };
    });
    console.log(JSON.stringify(pin));
    h.check(
      `phone pin distance in ${MIN_PIN_SVH}–${MAX_PIN_SVH}svh band`,
      pin.distanceSvh >= MIN_PIN_SVH && pin.distanceSvh <= MAX_PIN_SVH,
      `${pin.distanceSvh}svh`,
    );

    const stepAtTop = await page.evaluate(() => document.querySelector("[data-demo='workflow']")?.getAttribute("data-step"));
    await page.evaluate((vh) => window.scrollBy(0, vh * 0.95), pin.vh);
    await page.waitForTimeout(600);
    const stepAfterFling = await page.evaluate(() =>
      document.querySelector("[data-demo='workflow']")?.getAttribute("data-step"),
    );
    console.log(JSON.stringify({ stepAtTop, stepAfterFling }));
    h.check("one ~viewport fling does not jump straight to handoff", stepAfterFling !== "handoff", stepAfterFling ?? "missing");

    await page.evaluate(() => {
      const f = document.querySelector(".landing-site-footer");
      window.scrollTo(0, f.getBoundingClientRect().top + window.scrollY - window.innerHeight - 24);
    });
    await page.waitForTimeout(900);
    const above = await page.evaluate(() => document.querySelector(".landing-back-to-top").classList.contains("is-visible"));
    h.check("just above the footer ↑ Top is still offered", above);

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(900);
    const top = await page.evaluate(() => {
      const btn = document.querySelector(".landing-back-to-top");
      const link = document.querySelector(".landing-site-footer-link");
      const b = btn.getBoundingClientRect();
      const l = link.getBoundingClientRect();
      const visible = btn.classList.contains("is-visible") && getComputedStyle(btn).opacity !== "0";
      const gapY = Math.max(l.top - b.bottom, b.top - l.bottom);
      return { visible, gapY: Math.round(gapY) };
    });
    h.check("at page bottom ↑ Top is hidden while the footer is visible", !top.visible, JSON.stringify(top));
    await page.screenshot({ path: h.path.join(h.OUT, `${h.TAG}-phone-footer.png`) });
  } catch (e) {
    console.error(e);
    h.check("script completed without error", false, String(e).split("\n")[0]);
  } finally {
    await finishAndExit(run);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
