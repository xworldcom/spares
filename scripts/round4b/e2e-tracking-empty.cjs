/* eslint-disable @typescript-eslint/no-require-imports */
// Item 1: buyer opens a pre-ship quote -> Tracking section with empty state (v4-02).
const { h, HARDWARE_ID, finishAndExit } = require("./common.cjs");

(async () => {
  const run = await h.launch({ name: "tracking-empty" });
  const { page } = run;
  try {
    await h.apiLogin(run.context);
    const res = await run.context.request.post(`${h.BASE}/api/quotes`, {
      data: { machineId: HARDWARE_ID, items: [{ id: "91828A230", name: "Hex nut, M6", qty: 2 }] },
    });
    const { quote } = await res.json();
    await page.goto(`${h.BASE}/quotes/${quote.number}`, { waitUntil: "domcontentloaded" });
    await page.getByText("Messages", { exact: true }).first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(1500);
    const heading = page.getByRole("heading", { name: "Tracking" });
    h.check(`buyer sees Tracking heading on pre-ship quote #${quote.number} (status ${quote.status})`, (await heading.count()) === 1);
    h.check(
      "empty state copy shown",
      (await page.getByText("Tracking numbers appear here once your order ships.").count()) === 1,
    );
    await page.screenshot({ path: h.path.join(h.OUT, `${h.TAG}-tracking-empty.png`), fullPage: true });
  } catch (e) {
    console.error(e);
    h.check("script completed without error", false, String(e).split("\n")[0]);
  } finally {
    await finishAndExit(run);
  }
})().catch((e) => { console.error(e); process.exit(1); });
