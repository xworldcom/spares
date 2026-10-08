/* eslint-disable @typescript-eslint/no-require-imports */
// P1: in-app navigation while "Sending…" warns (client route guard); message still saves.
const { h, HARDWARE_ID, finishAndExit } = require("./common.cjs");

(async () => {
  const run = await h.launch({ name: "send-nav-guard" });
  const { page } = run;
  try {
    await h.apiLogin(run.context);
    const res = await run.context.request.post(`${h.BASE}/api/quotes`, {
      data: { machineId: HARDWARE_ID, items: [{ id: "91828A230", name: "Hex nut, M6", qty: 1 }] },
    });
    const { quote } = await res.json();
    await page.route(`**/api/quotes/*/activity`, async (route) => {
      if (route.request().method() === "POST") await new Promise((r) => setTimeout(r, 6000));
      await route.continue();
    });
    await page.goto(`${h.BASE}/quotes/${quote.number}`, { waitUntil: "domcontentloaded" });
    const box = page.locator("textarea").last();
    await box.waitFor({ state: "visible", timeout: 20000 });
    await box.fill("Round 4b route guard probe");
    const dialogs = [];
    page.on("dialog", async (d) => { dialogs.push(d.message()); await d.dismiss(); });
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await page.getByText("Round 4b route guard probe").first().waitFor({ timeout: 5000 });
    const link = page.locator('a[href="/machines"]:visible').first();
    await link.click({ noWaitAfter: true });
    await page.waitForTimeout(800);
    h.check("leave-page warning shown while Sending…", dialogs.length === 1, JSON.stringify(dialogs));
    h.check("dismissing keeps the user on the quote", new URL(page.url()).pathname === `/quotes/${quote.number}`, page.url());
    await page.waitForTimeout(6500);
    const saved = await run.context.request.get(`${h.BASE}/api/quotes/${quote.number}`);
    const text = JSON.stringify(await saved.json());
    h.check("message still saved", text.includes("Round 4b route guard probe"));
    page.removeAllListeners("dialog");
    page.on("dialog", (d) => d.accept());
    await link.click();
    await page.waitForURL(/\/machines/, { timeout: 15000 });
    h.check("with nothing pending, navigation is not blocked", true);
  } catch (e) {
    console.error(e);
    h.check("script completed without error", false, String(e).split("\n")[0]);
  } finally {
    await finishAndExit(run);
  }
})().catch((e) => { console.error(e); process.exit(1); });
