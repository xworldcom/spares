/* eslint-disable @typescript-eslint/no-require-imports */
const { h, finishAndExit } = require("./common.cjs");

async function assertFooterSignIn(page, label, viewportHeight) {
  const footer = page.locator(".landing-site-footer-link");
  await footer.waitFor({ state: "visible", timeout: 15000 });
  const box = await footer.boundingBox();
  h.check(
    `${label}: footer Sign in in viewport`,
    Boolean(box && box.y >= 0 && box.y + box.height <= viewportHeight + 2),
    JSON.stringify(box),
  );
}

async function exerciseViewport(page, { width, height, tag }) {
  const maxY = await page.evaluate(() => {
    const el = document.scrollingElement ?? document.documentElement;
    return el.scrollHeight - window.innerHeight;
  });

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(120);

  for (let i = 0; i < 24; i += 1) {
    await page.mouse.wheel(0, Math.round(height * 0.9));
    await page.waitForTimeout(280);
  }
  await assertFooterSignIn(page, `${tag}: wheel to footer`, height);

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(120);
  await page.evaluate(() => {
    const el = document.scrollingElement ?? document.documentElement;
    const max = el.scrollHeight - window.innerHeight;
    window.scrollTo(0, max);
  });
  await page.waitForTimeout(500);
  await assertFooterSignIn(page, `${tag}: jump to document end`, height);

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(120);
  for (let i = 0; i < 14; i += 1) {
    await page.mouse.wheel(0, Math.round(height * 1.2));
    await page.waitForTimeout(180);
  }
  await assertFooterSignIn(page, `${tag}: fast fling to footer`, height);

  const backTop = await page.evaluate(() => window.scrollY);
  h.check(`${tag}: can scroll back toward hero`, backTop > maxY * 0.35, String(backTop));
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForTimeout(200);
  const heroY = await page.evaluate(() => window.scrollY);
  h.check(`${tag}: hero reachable after footer`, heroY < height * 0.2, String(heroY));

  await page.screenshot({ path: h.path.join(h.OUT, `${h.TAG}-scroll-reach-${tag}.png`) });
}

(async () => {
  const viewports = [
    { width: 1280, height: 800, mobile: false, tag: "desktop-1280" },
    { width: 320, height: 568, mobile: true, tag: "phone-320" },
  ];
  let lastRun = null;
  for (const vp of viewports) {
    lastRun = await h.launch({ name: `scroll-reach-${vp.tag}`, viewport: { width: vp.width, height: vp.height }, mobile: vp.mobile });
    const { page } = lastRun;
    try {
      await page.goto(`${h.BASE}/`, { waitUntil: "networkidle" });
      await page.locator(".landing-demo-scrub").first().waitFor({ state: "attached", timeout: 30000 });
      const snapType = await page.evaluate(() => getComputedStyle(document.documentElement).scrollSnapType);
      h.check(`${vp.tag}: mandatory snap on document`, /mandatory/i.test(snapType), snapType);
      await exerciseViewport(page, vp);
    } catch (e) {
      console.error(e);
      h.check(`${vp.tag}: script completed without error`, false, String(e).split("\n")[0]);
    } finally {
      await h.finish(lastRun);
      lastRun = null;
    }
  }
  process.exit(h.checks.some((c) => !c.ok) ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
