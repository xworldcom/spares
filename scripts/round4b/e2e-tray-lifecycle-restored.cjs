/* eslint-disable @typescript-eslint/no-require-imports */
// Item 4: tray restored from localStorage shows lifecycle on 6331K32 / 5972K325 (hardware-fixture, buyer).
const { h, restoreTrayFromStorage, finishAndExit } = require("./common.cjs");

(async () => {
  const run = await h.launch({ name: "tray-lifecycle-restored" });
  const { page } = run;
  try {
    await h.apiLogin(run.context);
    await restoreTrayFromStorage(page, [
      { id: "6331K32", name: "Miniature DC motor", meshName: "", qty: 1 },
      { id: "5972K325", name: "Shielded ball bearing, 8 mm ID x 22 mm OD x 7 mm W", meshName: "", qty: 2 },
    ]);
    const rows = page.locator(".quote-sheet-form .manual-quote-row");
    await rows.first().waitFor({ state: "visible", timeout: 30000 });
    await page.waitForTimeout(1500);
    h.check("two restored tray lines", (await rows.count()) === 2, String(await rows.count()));
    const motor = rows.filter({ hasText: "6331K32" });
    const bearing = rows.filter({ hasText: "5972K325" });
    h.check("6331K32 line shows Discontinued", /Discontinued/.test((await motor.textContent()) ?? ""), await motor.textContent());
    h.check(
      "5972K325 line shows Discontinuation announced",
      /Discontinuation announced/.test((await bearing.textContent()) ?? ""),
      await bearing.textContent(),
    );
    await page.screenshot({ path: h.path.join(h.OUT, `${h.TAG}-tray-lifecycle-restored.png`) });
  } catch (e) {
    console.error(e);
    h.check("script completed without error", false, String(e).split("\n")[0]);
  } finally {
    await finishAndExit(run);
  }
})().catch((e) => { console.error(e); process.exit(1); });
