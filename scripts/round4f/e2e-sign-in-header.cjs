/* eslint-disable @typescript-eslint/no-require-imports */
const { h, finishAndExit } = require("./common.cjs");

(async () => {
  const run = await h.launch({ name: "sign-in-header", viewport: { width: 1280, height: 800 } });
  const { page } = run;
  try {
    await page.goto(`${h.BASE}/`, { waitUntil: "networkidle" });
    const header = page.locator("header a.spares-header-sign-in");
    await header.waitFor({ state: "visible", timeout: 10000 });
    const styles = await header.evaluate((el) => {
      const s = getComputedStyle(el);
      return { bg: s.backgroundColor, radius: s.borderRadius };
    });
    h.check("header Sign in is visible on cinematic landing", true);
    h.check("header Sign in uses cream pill", /236|234|228/.test(styles.bg) || styles.bg === "rgb(236, 234, 228)");
    await page.screenshot({ path: h.path.join(h.OUT, `${h.TAG}-sign-in-header.png`) });
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
