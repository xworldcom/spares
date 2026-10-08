/* eslint-disable @typescript-eslint/no-require-imports */
// v5-01: isolate keeps the sheet open, shows banner + Show all, chrome Show all, toggle label.
const { h, HARDWARE_ID, finishAndExit } = require("./common.cjs");

(async () => {
  const run = await h.launch({ name: "isolate" });
  const { page } = run;
  const showAllChrome = () => page.locator("[data-show-all]");
  const partSheet = () => page.locator("[data-part-sheet]");
  try {
    await h.apiLogin(run.context);
    await page.goto(`${h.BASE}/machines/${HARDWARE_ID}`, { waitUntil: "domcontentloaded" });
    await page.locator("canvas").first().waitFor({ state: "visible", timeout: 45000 });

    await page.getByRole("button", { name: "List" }).click();
    await page.locator("[data-parts-bom] li button").first().click();
    await page.getByRole("button", { name: "More" }).click();
    const partName = await page.locator("[data-part-sheet] p.font-semibold").first().innerText();
    await page.getByRole("button", { name: "Only this", exact: true }).click();
    await page.waitForTimeout(400);

    h.check("after Only this the part sheet stays open", (await partSheet().count()) === 1);
    h.check("isolation banner names the part", await page.locator("[data-isolation-banner]").innerText().then((t) => t.includes(partName.trim())));
    h.check("sheet offers Show all", (await page.locator("[data-isolation-banner] button", { hasText: "Show all" }).count()) === 1);
    h.check("chrome Show all appears for isolation", (await showAllChrome().count()) === 1);
    h.check(
      "Only this becomes Show all parts when active",
      (await page.getByRole("button", { name: "Show all parts", exact: true }).count()) === 1,
    );
    await page.screenshot({ path: h.path.join(h.OUT, `${h.TAG}-isolated-sheet.png`) });

    await page.getByRole("button", { name: "Show all parts", exact: true }).click();
    await page.waitForTimeout(300);
    h.check("toggle clears isolation", (await showAllChrome().count()) === 0);
    h.check("banner clears", (await page.locator("[data-isolation-banner]").count()) === 0);

    await page.getByRole("button", { name: "Only this", exact: true }).click();
    await page.waitForTimeout(300);
    await showAllChrome().click();
    await page.waitForTimeout(300);
    h.check("chrome Show all clears isolation", (await showAllChrome().count()) === 0);
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
