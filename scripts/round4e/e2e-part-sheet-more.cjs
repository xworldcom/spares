/* eslint-disable @typescript-eslint/no-require-imports */
const { h, HARDWARE_ID, finishAndExit } = require("./common.cjs");

(async () => {
  const run = await h.launch({ name: "part-sheet-more", viewport: { width: 1280, height: 800 } });
  const { page } = run;
  try {
    await h.uiLogin(page, h.CUSTOMER, `/machines/${HARDWARE_ID}`);
    await page.getByRole("button", { name: "3D" }).click();
    await page.locator(".machine-viewer canvas").first().click({ position: { x: 420, y: 280 } });
    await page.waitForSelector("[data-part-sheet]", { timeout: 15000 });

    const more = page.getByRole("button", { name: "More", exact: true });
    let opened = false;
    for (let attempt = 1; attempt <= 12; attempt += 1) {
      await more.click({ force: false, timeout: 5000 });
      await page.waitForTimeout(60);
      const expanded = await more.getAttribute("aria-expanded");
      const hideVisible = await page.getByRole("button", { name: "Hide", exact: true }).isVisible();
      if (expanded === "true" && hideVisible) {
        opened = true;
        break;
      }
    }
    h.check("More opens detail after repeated pointer clicks", opened, "aria-expanded / Hide");
    await page.screenshot({ path: h.path.join(h.OUT, `${h.TAG}-part-sheet-more.png`) });
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
