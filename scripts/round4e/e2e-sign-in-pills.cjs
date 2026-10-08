/* eslint-disable @typescript-eslint/no-require-imports */
const { h, finishAndExit } = require("./common.cjs");

(async () => {
  const run = await h.launch({ name: "sign-in-pills", viewport: { width: 1280, height: 800 } });
  const { page } = run;
  try {
    await page.goto(`${h.BASE}/`, { waitUntil: "networkidle" });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(400);

    const foot = page.locator(".landing-section-foot-link");
    await foot.waitFor({ state: "visible" });

    const landingStyles = await page.evaluate(() => {
      const footLink = document.querySelector(".landing-section-foot-link");
      const footerLink = document.querySelector(".landing-site-footer-link");
      function read(el) {
        if (!el) {
          return null;
        }
        const s = getComputedStyle(el);
        return {
          bg: s.backgroundColor,
          radius: s.borderRadius,
          textDecoration: s.textDecorationLine,
        };
      }
      return { ctaFoot: read(footLink), siteFoot: read(footerLink) };
    });
    console.log(JSON.stringify(landingStyles));

    for (const link of [landingStyles.ctaFoot, landingStyles.siteFoot]) {
      h.check("landing Sign in is a text link (underlined)", link?.textDecoration === "underline");
      h.check(
        "landing Sign in is not a cream pill",
        link?.bg === "rgba(0, 0, 0, 0)" || link?.bg === "transparent",
      );
    }

    await page.screenshot({ path: h.path.join(h.OUT, `${h.TAG}-sign-in-pills.png`) });
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
