/* eslint-disable @typescript-eslint/no-require-imports */
/* Round 3 / HIGH 2 — quote tray survives F5 and a machine switch (per-machine storage). */
const h = require("./harness.cjs");

const trayStorage = (page) =>
  page.evaluate(() =>
    Object.fromEntries(
      Object.keys(localStorage)
        .filter((k) => k.startsWith("spares-quote-tray:"))
        .map((k) => [k.split(":").slice(2).join(":"), JSON.parse(localStorage.getItem(k))]),
    ),
  );

async function addManual(page, pn, desc, qty) {
  const form = page.locator(".manual-quote-add:visible").first();
  await form.waitFor({ timeout: 20000 });
  await form.locator("input").nth(0).fill(pn);
  await form.locator("input").nth(1).fill(desc);
  await form.locator("input").nth(2).fill(String(qty));
  await form.getByRole("button", { name: "Add part" }).click();
  await page.getByText(desc).first().waitFor({ timeout: 5000 });
}

(async () => {
  const s = await h.launch({ name: "tray-persist" });
  const { context, page } = s;
  await h.apiLogin(context);
  await page.goto(h.BASE + "/machines/palletizer", { waitUntil: "domcontentloaded" });
  await addManual(page, "R3-PN-1", "R3 Bearing", 2);
  await addManual(page, "R3-PN-2", "R3 Belt", 1);
  await page.waitForTimeout(500);
  let store = await trayStorage(page);
  h.check("palletizer tray written to localStorage", store.palletizer?.length === 2, JSON.stringify(store));
  await page.screenshot({ path: `${h.OUT}/${h.TAG}-tray-persist-1-added.png` });

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);
  store = await trayStorage(page);
  h.check("F5: storage not wiped", store.palletizer?.length === 2, JSON.stringify(store));
  const afterReload = await page.locator("[data-quote-tray]").first().innerText().catch(() => "");
  h.check("F5: tray shows both parts", /R3 Bearing/.test(afterReload) && /R3 Belt/.test(afterReload), afterReload.slice(0, 160));
  await page.screenshot({ path: `${h.OUT}/${h.TAG}-tray-persist-2-after-f5.png` });

  // Soft machine switch (client navigation), then back.
  await page.goto(h.BASE + "/machines", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await page.locator('a[href="/machines/hardware-fixture"]').first().click();
  await page.waitForURL(/hardware-fixture/);
  await page.waitForTimeout(2500);
  store = await trayStorage(page);
  h.check("switch to other machine: palletizer tray untouched", store.palletizer?.length === 2, JSON.stringify(store));
  h.check("switch to other machine: nothing leaked into it", !store["hardware-fixture"]?.some((l) => /R3-PN/.test(l.id)), JSON.stringify(store["hardware-fixture"] ?? null));
  await addManual(page, "R3-PN-3", "R3 Gasket", 4);
  await page.waitForTimeout(400);
  await page.goBack();
  await page.waitForURL(/\/machines$/);
  await page.locator('a[href="/machines/palletizer"]').first().click();
  await page.waitForURL(/palletizer/);
  await page.waitForTimeout(2500);
  const back = await page.locator("[data-quote-tray]").first().innerText().catch(() => "");
  store = await trayStorage(page);
  h.check("back to palletizer: its parts are there", /R3 Bearing/.test(back) && /R3 Belt/.test(back) && !/R3 Gasket/.test(back), back.slice(0, 200));
  h.check("both machines keep their own tray", store.palletizer?.length === 2 && store["hardware-fixture"]?.length === 1, JSON.stringify(Object.keys(store)));
  await page.screenshot({ path: `${h.OUT}/${h.TAG}-tray-persist-3-switch-back.png` });

  h.writeProof("tray-persist");
  await h.finish(s, "tray-persist");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
