/* eslint-disable @typescript-eslint/no-require-imports */
const h = require("./harness.cjs");

const HARDWARE_ID = "hardware-fixture";
const NOTE = "Round4 tray note " + Date.now();

async function main() {
  const run = await h.launch({ name: "tray-note-persist" });
  const { page } = run;
  try {
    await h.apiLogin(run.context);
    await page.goto(`${h.BASE}/machines/${HARDWARE_ID}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "List" }).click();
    const addBtn = page.locator("[data-parts-bom] button", { hasText: "Add" }).first();
    await addBtn.waitFor({ state: "visible", timeout: 15000 });
    await addBtn.click();
    const note = page.locator(".quote-sheet-form textarea").first();
    await note.waitFor({ state: "visible", timeout: 30000 });
    await note.fill(NOTE);
    await page.reload({ waitUntil: "networkidle" });
    const value = await page.locator(".quote-sheet-form textarea").first().inputValue();
    h.check("tray note survives reload", value.includes(NOTE), value);
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
