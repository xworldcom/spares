/* eslint-disable @typescript-eslint/no-require-imports */
// Item 3: long tray line names wrap to 2 lines with a title (not single-line truncate).
const { h, restoreTrayFromStorage, finishAndExit } = require("./common.cjs");

const LONG =
  "Shielded deep-groove ball bearing, 8 mm ID x 22 mm OD x 7 mm W, double rubber seal, chrome steel, pre-lubricated";

(async () => {
  const run = await h.launch({ name: "tray-line-names", viewport: { width: 1280, height: 800 } });
  const { page } = run;
  try {
    await h.apiLogin(run.context);
    await restoreTrayFromStorage(page, [{ id: "ZZ-MANUAL-LONG-1", name: LONG, meshName: "", qty: 1 }]);
    const name = page.locator(".quote-sheet-form .manual-quote-row [data-tray-line-name], .quote-sheet-form .manual-quote-row p").first();
    await name.waitFor({ state: "visible", timeout: 30000 });
    const m = await name.evaluate((el) => {
      const cs = getComputedStyle(el);
      const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
      return {
        title: el.getAttribute("title"),
        clamp: cs.getPropertyValue("-webkit-line-clamp"),
        lines: Math.round(el.getBoundingClientRect().height / lh),
        ellipsis: cs.textOverflow,
        nowrap: cs.whiteSpace === "nowrap",
      };
    });
    console.log(JSON.stringify(m));
    h.check("tray line name has title with full text", m.title === LONG, String(m.title));
    h.check("tray line name wraps to 2 lines (clamp 2, not nowrap)", m.clamp === "2" && !m.nowrap && m.lines === 2, JSON.stringify(m));
    await page.screenshot({ path: h.path.join(h.OUT, `${h.TAG}-tray-line-names.png`) });
  } catch (e) {
    console.error(e);
    h.check("script completed without error", false, String(e).split("\n")[0]);
  } finally {
    await finishAndExit(run);
  }
})().catch((e) => { console.error(e); process.exit(1); });
