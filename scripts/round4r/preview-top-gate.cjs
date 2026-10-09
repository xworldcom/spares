/* eslint-disable @typescript-eslint/no-require-imports */
/** Round 4r — Top a11y + pointer consistency on preview. */
const { chromium } = require("playwright");
const q4 = require("../round4q/gate-assertions.cjs");

const BASE = (process.env.PREVIEW_BASE ?? "").replace(/\/$/, "");
if (!BASE) {
  console.error("PREVIEW_BASE required");
  process.exit(2);
}

const results = [];
const log = (id, ok, detail) => {
  results.push({ id, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${id} ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
};

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN ?? "/usr/local/bin/google-chrome",
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  page.setDefaultTimeout(60_000);
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".landing-demo-scrub[data-hydrated='1']");

  const mid = await q4.assertTopInteractionConsistent(page, 1175);
  log("375-top-opacity-pointer-sync", mid.ok, mid);

  const focus = await q4.assertTopHideReleasesFocus(page);
  log("375-top-inert-on-tray-hide", focus.ok, focus);

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
