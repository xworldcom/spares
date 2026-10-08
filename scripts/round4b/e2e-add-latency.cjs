/* eslint-disable @typescript-eslint/no-require-imports */
// Add-to-tray latency on a production build with the real WebGL canvas (SwiftShader GL, no stubs).
// Metrics are taken in-page: click -> tray line in DOM, click -> next painted frame, worst main-thread block.
const h = require("../round4/harness.cjs");

const HARDWARE_ID = "hardware-fixture";
const BUDGET_MS = Number(process.env.R4B_ADD_BUDGET_MS ?? 250);

const INSTRUMENT = () => {
  window.__add = { t0: 0, line: 0, paint: 0, toast: 0, count: 0, longest: 0, tasks: [] };
  const mark = () => {
    window.__add.t0 = performance.now();
    window.__add.line = window.__add.paint = window.__add.toast = window.__add.count = 0;
    window.__add.tasks = [];
    requestAnimationFrame(() => requestAnimationFrame(() => (window.__add.paint = performance.now())));
  };
  document.addEventListener("click", (event) => {
    const el = event.target instanceof Element ? event.target.closest("button") : null;
    if (el && /^(Add|Add to quote)/.test((el.textContent || "").trim())) mark();
  }, true);
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (window.__add.t0 && entry.startTime >= window.__add.t0 - 5) {
        window.__add.tasks.push(Math.round(entry.duration));
      }
    }
  }).observe({ type: "longtask", buffered: false });
  new MutationObserver(() => {
    const a = window.__add;
    if (!a.t0) return;
    const now = performance.now();
    if (!a.line && document.querySelector(".manual-quote-row")) a.line = now;
    if (!a.toast && document.querySelector("[data-quote-add-toast], .quote-add-toast")) a.toast = now;
  }).observe(document, { childList: true, subtree: true });
};

async function main() {
  const run = await h.launch({ name: "add-latency" });
  const { page } = run;
  try {
    await h.apiLogin(run.context);
    await page.addInitScript(INSTRUMENT);
    await page.goto(`${h.BASE}/machines/${HARDWARE_ID}`, { waitUntil: "domcontentloaded" });
    await page.locator("canvas").first().waitFor({ state: "visible", timeout: 45000 });
    const gl = await page.evaluate(() => {
      const c = document.querySelector("canvas");
      const g = c && (c.getContext("webgl2") || c.getContext("webgl"));
      return Boolean(g && !g.isContextLost());
    });
    h.check("real WebGL canvas mounted (not stubbed)", gl);
    await page.getByRole("button", { name: "List" }).click();
    const addBtn = page.locator("[data-parts-bom] button", { hasText: "Add" }).first();
    await addBtn.waitFor({ state: "visible", timeout: 30000 });
    await page.waitForTimeout(2500);

    await addBtn.click();
    await page.waitForFunction(() => window.__add.paint > 0 && window.__add.line > 0, null, { timeout: 15000 }).catch(async () => { console.log("DEBUG", JSON.stringify(await page.evaluate(() => ({ ...window.__add, tray: document.querySelectorAll(".manual-quote-row").length })))); throw new Error("no-add-signal"); });
    await page.waitForTimeout(3000);
    const m = await page.evaluate(() => {
      const a = window.__add;
      return {
        toLine: Math.round(a.line - a.t0),
        toPaint: Math.round(a.paint - a.t0),
        longest: Math.max(0, ...a.tasks),
        tasks: a.tasks,
      };
    });
    console.log(JSON.stringify(m));
    h.check(`tray line in DOM within ${BUDGET_MS}ms of click`, m.toLine <= BUDGET_MS, `${m.toLine}ms`);
    h.check(`next painted frame within ${BUDGET_MS}ms of click`, m.toPaint <= BUDGET_MS, `${m.toPaint}ms`);
    h.check(`no main-thread block over ${BUDGET_MS}ms after click`, m.longest <= BUDGET_MS, `${m.longest}ms ${JSON.stringify(m.tasks)}`);
    await page.screenshot({ path: h.path.join(h.OUT, `${h.TAG}-add-latency.png`) });

    // Phone-class CPU: 4x slowdown, second part. Bea's 1-3s is the desktop cost multiplied on a slower device.
    const cdp = await run.context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.evaluate(() => { window.__add.t0 = 0; });
    await page.locator("[data-parts-bom] button", { hasText: "Add" }).nth(1).click();
    await page.waitForFunction(() => window.__add.paint > 0 && window.__add.line > 0, null, { timeout: 30000 });
    await page.waitForTimeout(3000);
    const t = await page.evaluate(() => ({ toPaint: Math.round(window.__add.paint - window.__add.t0), longest: Math.max(0, ...window.__add.tasks), tasks: window.__add.tasks }));
    console.log("4x CPU", JSON.stringify(t));
    h.check(`4x CPU throttle: next painted frame within ${BUDGET_MS * 2}ms`, t.toPaint <= BUDGET_MS * 2, `${t.toPaint}ms`);
    h.check(`4x CPU throttle: no main-thread block over ${BUDGET_MS * 2}ms`, t.longest <= BUDGET_MS * 2, `${t.longest}ms ${JSON.stringify(t.tasks)}`);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  } catch (e) {
    console.error(e);
    h.check("script completed without error", false, String(e).split("\n")[0]);
  } finally {
    await h.finish(run);
  }
  if (h.checks.some((c) => !c.ok)) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
