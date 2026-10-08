/* eslint-disable @typescript-eslint/no-require-imports */
const h = require("./harness.cjs");

const HARDWARE_ID = "hardware-fixture";
const NOTE = "Need by Friday at Plant 7, serial 4471-B";

async function main() {
  const run = await h.launch({ name: "tray-note-typing" });
  const { page } = run;
  const textarea = () => page.locator(".quote-sheet-form textarea").first();
  try {
    await h.apiLogin(run.context);
    await page.goto(`${h.BASE}/machines/${HARDWARE_ID}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "List" }).click();
    const addBtn = page.locator("[data-parts-bom] button", { hasText: "Add" }).first();
    await addBtn.waitFor({ state: "visible", timeout: 30000 });
    await addBtn.click();
    await textarea().waitFor({ state: "visible", timeout: 30000 });

    await textarea().click();
    await textarea().pressSequentially(NOTE, { delay: 25 });
    await page.screenshot({ path: h.path.join(h.OUT, `${h.TAG}-note-typed.png`) });
    h.check("field shows full note while typing", (await textarea().inputValue()) === NOTE, await textarea().inputValue());

    await page.reload({ waitUntil: "networkidle" });
    await textarea().waitFor({ state: "visible", timeout: 30000 });
    h.check("full note restored after reload", (await textarea().inputValue()) === NOTE, await textarea().inputValue());
    await page.screenshot({ path: h.path.join(h.OUT, `${h.TAG}-note-after-reload.png`) });

    await page.getByRole("button", { name: "Request quote" }).click();
    await page.waitForURL(/\/quotes\//, { timeout: 30000 });
    const list = await run.context.request.get(`${h.BASE}/api/quotes`);
    const body = await list.json();
    const rows = Array.isArray(body) ? body : (body.quotes ?? []);
    const mine = rows.filter((quote) => quote.note === NOTE);
    h.check("submitted quote carries full note", mine.length > 0, JSON.stringify(rows.map((q) => q.note).slice(0, 3)));
    await page.screenshot({ path: h.path.join(h.OUT, `${h.TAG}-quote-submitted.png`) });
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
