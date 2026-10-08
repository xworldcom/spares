/* eslint-disable @typescript-eslint/no-require-imports */
const h = require("./harness.cjs");

const HARDWARE_ID = "hardware-fixture";

async function main() {
  const run = await h.launch({ name: "explode-selection" });
  const { page } = run;
  try {
    await h.apiLogin(run.context);
    await page.goto(`${h.BASE}/machines/${HARDWARE_ID}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "List" }).click();
    await page.locator("[data-parts-bom] button").first().click();
    await page.waitForSelector("[data-part-sheet]", { timeout: 15000 });
    const sheetBefore = await page.locator("[data-part-sheet]").count();
    const slider = page.locator(".explode-slider");
    await slider.click();
    await slider.fill("40");
    await page.waitForTimeout(400);
    const sheetAfter = await page.locator("[data-part-sheet]").count();
    h.check("part sheet stays open while adjusting explode", sheetAfter >= sheetBefore, String(sheetAfter));
  } finally {
    await h.finish(run);
  }
  const failed = h.checks.filter((c) => !c.ok);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
