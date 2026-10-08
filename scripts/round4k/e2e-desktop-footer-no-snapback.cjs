/* eslint-disable @typescript-eslint/no-require-imports */
const { h, finishAndExit } = require("./common.cjs");

const STABLE_MS = 3000;
const SNAP_BACK_TOLERANCE = 120;

async function waitScrubHydrated(page) {
  await page.locator(".landing-demo-scrub").first().waitFor({ state: "attached", timeout: 30000 });
  await page.waitForSelector(".landing-demo-scrub[data-hydrated='1']", { timeout: 30000 });
}

async function assertFooterInView(page, label, viewportHeight) {
  const footer = page.locator(".landing-site-footer-link");
  await footer.waitFor({ state: "visible", timeout: 15000 });
  const box = await footer.boundingBox();
  h.check(
    `${label}: footer Sign in visible`,
    Boolean(box && box.y >= 0 && box.y + box.height <= viewportHeight + 4),
    JSON.stringify(box),
  );
}

async function assertScrollYStable(page, label, baselineY) {
  const samples = [];
  const start = Date.now();
  while (Date.now() - start < STABLE_MS) {
    const y = await page.evaluate(() => window.scrollY);
    samples.push(y);
    await page.waitForTimeout(200);
  }
  const minY = Math.min(...samples);
  const maxY = Math.max(...samples);
  const drift = maxY - minY;
  h.check(
    `${label}: scrollY stable ${STABLE_MS}ms`,
    drift <= 8,
    `min=${minY} max=${maxY} drift=${drift}`,
  );
  h.check(
    `${label}: no snap-back from settle`,
    minY >= baselineY - SNAP_BACK_TOLERANCE,
    `baseline=${baselineY} minSample=${minY}`,
  );
}

async function scrollToTop(page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
}

async function reachFooterWithEnd(page, height) {
  await scrollToTop(page);
  await page.keyboard.press("End");
  await page.waitForTimeout(800);
  const maxY = await page.evaluate(() => {
    const el = document.scrollingElement ?? document.documentElement;
    return el.scrollHeight - window.innerHeight;
  });
  for (let i = 0; i < 24; i += 1) {
    const box = await page.locator(".landing-site-footer-link").boundingBox();
    if (box && box.y >= 0 && box.y + box.height <= height + 4) {
      break;
    }
    const y = await page.evaluate(() => window.scrollY);
    if (y >= maxY - 24) {
      break;
    }
    await page.keyboard.press("PageDown");
    await page.waitForTimeout(350);
  }
  await page.waitForTimeout(600);
}

async function reachFooterWithPageDown(page, height) {
  await scrollToTop(page);
  const maxY = await page.evaluate(() => {
    const el = document.scrollingElement ?? document.documentElement;
    return el.scrollHeight - window.innerHeight;
  });
  for (let i = 0; i < 96; i += 1) {
    const box = await page.locator(".landing-site-footer-link").boundingBox();
    if (box && box.y >= 0 && box.y + box.height <= height + 4) {
      break;
    }
    const y = await page.evaluate(() => window.scrollY);
    if (y >= maxY - 24) {
      break;
    }
    await page.keyboard.press("PageDown");
    await page.waitForTimeout(320);
  }
  await page.waitForTimeout(600);
}

async function reachFooterWithWheel(page, height) {
  await scrollToTop(page);
  for (let i = 0; i < 36; i += 1) {
    const box = await page.locator(".landing-site-footer-link").boundingBox();
    if (box && box.y >= 0 && box.y + box.height <= height + 4) {
      break;
    }
    await page.mouse.wheel(0, Math.round(height * 0.92));
    await page.waitForTimeout(260);
  }
}

(async () => {
  h.checks.length = 0;
  const height = 900;
  const run = await h.launch({
    name: "footer-no-snapback",
    viewport: { width: 1440, height },
    mobile: false,
  });
  const { page } = run;
  try {
    await page.goto(`${h.BASE}/`, { waitUntil: "networkidle" });
    await waitScrubHydrated(page);

    await reachFooterWithEnd(page, height);
    await assertFooterInView(page, "End key", height);
    const endY = await page.evaluate(() => window.scrollY);
    await assertScrollYStable(page, "End key", endY);

    await reachFooterWithPageDown(page, height);
    await assertFooterInView(page, "PageDown from hero", height);
    const pdY = await page.evaluate(() => window.scrollY);
    await assertScrollYStable(page, "PageDown from hero", pdY);

    await reachFooterWithWheel(page, height);
    await assertFooterInView(page, "wheel from hero", height);
    const wheelY = await page.evaluate(() => window.scrollY);
    await assertScrollYStable(page, "wheel from hero", wheelY);

    await page.screenshot({
      path: h.path.join(h.OUT, `${h.TAG}-desktop-footer-stable.png`),
    });
  } catch (e) {
    console.error(e);
    h.check("desktop footer script completed", false, String(e).split("\n")[0]);
  } finally {
    await finishAndExit(run);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
