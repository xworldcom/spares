/* eslint-disable @typescript-eslint/no-require-imports */
// P1: phone landing -- (1) pinned demo distance is short, (2) ↑ Top never sits on Sign in.
const { h, finishAndExit } = require("./common.cjs");

const MAX_PIN_SVH = 450; // ~5 swipes at ~0.9 viewport per swipe; main was 1000 (~9-11)

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
    h.check(`phone pin distance <= ${MAX_PIN_SVH}svh (≈${(pin.distanceSvh / 90).toFixed(1)} swipes)`, pin.distanceSvh <= MAX_PIN_SVH, `${pin.distanceSvh}svh`);

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
      const overlapX = b.left < l.right && b.right > l.left;
      return { visible, gapY: Math.round(gapY), overlapX, btn: [b.top, b.bottom], link: [l.top, l.bottom] };
    });
    console.log(JSON.stringify(top));
    h.check(
      "at page bottom ↑ Top is hidden (footer in view) or clears Sign in by ≥12px",
      !top.visible || top.gapY >= 12,
      JSON.stringify(top),
    );
    h.check("at page bottom ↑ Top is hidden while the footer is visible", !top.visible, JSON.stringify(top));
    await page.screenshot({ path: h.path.join(h.OUT, `${h.TAG}-phone-footer.png`) });
  } catch (e) {
    console.error(e);
    h.check("script completed without error", false, String(e).split("\n")[0]);
  } finally {
    await finishAndExit(run);
  }
})().catch((e) => { console.error(e); process.exit(1); });
