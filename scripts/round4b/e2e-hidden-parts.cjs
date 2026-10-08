/* eslint-disable @typescript-eslint/no-require-imports */
// v4-05 / v4-06: "Show all" depends only on the hidden set; hidden parts survive F5 (also while exploded).
const { h, HARDWARE_ID, HIDDEN_KEY, finishAndExit } = require("./common.cjs");

(async () => {
  const run = await h.launch({ name: "hidden-parts" });
  const { page } = run;
  const showAll = () => page.locator("[data-show-all]");
  const setExplode = async (value) => {
    const slider = page.locator(".explode-slider");
    await slider.evaluate((el, v) => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      set.call(el, String(v));
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
  };
  try {
    await h.apiLogin(run.context);
    await page.goto(`${h.BASE}/machines/${HARDWARE_ID}`, { waitUntil: "domcontentloaded" });
    await page.locator("canvas").first().waitFor({ state: "visible", timeout: 45000 });
    await page.evaluate((k) => localStorage.removeItem(k), HIDDEN_KEY);

    await setExplode(60);
    await page.waitForTimeout(500);
    h.check("exploded with nothing hidden: no Show all (v4-05)", (await showAll().count()) === 0);
    await page.screenshot({ path: h.path.join(h.OUT, `${h.TAG}-exploded-no-showall.png`) });

    await page.getByRole("button", { name: "List" }).click();
    await page.locator("[data-parts-bom] li button").first().click();
    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("button", { name: "Hide", exact: true }).click();
    await page.waitForTimeout(400);
    h.check("after Hide: Show all appears", (await showAll().count()) === 1);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("canvas").first().waitFor({ state: "visible", timeout: 45000 });
    await page.waitForTimeout(1500);
    const stored = await page.evaluate((k) => localStorage.getItem(k), HIDDEN_KEY);
    h.check("hidden set persisted per tenant+machine", Boolean(stored) && JSON.parse(stored).length === 1, String(stored));
    h.check("after F5 the part is still hidden (Show all present) (v4-06)", (await showAll().count()) === 1);

    await setExplode(60);
    await page.waitForTimeout(400);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("canvas").first().waitFor({ state: "visible", timeout: 45000 });
    await page.waitForTimeout(1500);
    h.check("hidden + explode, F5: hidden part still hidden", (await showAll().count()) === 1);
    await page.screenshot({ path: h.path.join(h.OUT, `${h.TAG}-hidden-after-reload.png`) });

    await showAll().click();
    await page.waitForTimeout(400);
    h.check("Show all restores parts and button disappears", (await showAll().count()) === 0);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("canvas").first().waitFor({ state: "visible", timeout: 45000 });
    await page.waitForTimeout(1000);
    h.check("after Show all + F5 nothing is hidden", (await showAll().count()) === 0 && (await page.evaluate((k) => localStorage.getItem(k), HIDDEN_KEY)) === null);
  } catch (e) {
    console.error(e);
    h.check("script completed without error", false, String(e).split("\n")[0]);
  } finally {
    await finishAndExit(run);
  }
})().catch((e) => { console.error(e); process.exit(1); });
