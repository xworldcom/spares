/* eslint-disable @typescript-eslint/no-require-imports */
const { h, finishAndExit } = require("./common.cjs");

(async () => {
  const run = await h.launch({ name: "isolate-chip", viewport: { width: 1280, height: 800 } });
  const { page } = run;
  try {
    await h.uiLogin(page, h.CUSTOMER, "/machines/hardware-fixture");
    await page.getByRole("button", { name: "3D" }).click();
    await page.locator(".machine-viewer canvas").first().click({ position: { x: 420, y: 280 } });
    await page.getByRole("button", { name: "More", exact: true }).click();
    const only = page.getByRole("button", { name: "Only this", exact: true });
    await only.waitFor({ state: "visible" });
    const chip = await only.evaluate((el) => {
      const bg = getComputedStyle(el).backgroundColor;
      const color = getComputedStyle(el).color;
      return { bg, color, w: el.getBoundingClientRect().width };
    });
    console.log(JSON.stringify(chip));
    h.check("Only this chip has non-transparent fill", chip.bg !== "rgba(0, 0, 0, 0)" && chip.bg !== "transparent");
    h.check("Only this label contrasts with chip", chip.w > 48);
    await page.screenshot({ path: h.path.join(h.OUT, `${h.TAG}-only-this-chip.png`) });
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
