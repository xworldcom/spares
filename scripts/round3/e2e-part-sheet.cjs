/* eslint-disable @typescript-eslint/no-require-imports */
/* Round 3 / HIGH 4 — the part sheet must show real fields + lifecycle, or an honest empty state (never only the PN). */
const h = require("./harness.cjs");

async function openPart(page, name) {
  await page.goto(h.BASE + "/machines/hardware-fixture", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  await page.getByRole("button", { name: "List", exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(800);
  const row = page.getByText(name, { exact: true }).first();
  await row.waitFor({ timeout: 20000 });
  await row.click();
  const sheet = page.locator("[data-part-sheet]").first();
  await sheet.waitFor({ timeout: 10000 });
  await sheet.getByRole("button", { name: "More" }).click();
  await page.waitForTimeout(500);
  return sheet;
}

(async () => {
  const s = await h.launch({ name: "part-sheet" });
  const { context, page } = s;
  await h.apiLogin(context);

  const motor = await openPart(page, "Miniature DC motor");
  const motorText = await motor.innerText();
  await page.screenshot({ path: `${h.OUT}/${h.TAG}-part-sheet-motor.png` });
  h.check("motor sheet labels the Part number", /Part number/i.test(motorText), motorText.replace(/\n/g, " | "));
  h.check("motor sheet shows the Description", /Description/i.test(motorText), motorText.replace(/\n/g, " | "));
  h.check("motor sheet shows how many are in the machine", /In this machine/i.test(motorText), motorText.replace(/\n/g, " | "));
  h.check("motor sheet shows Lifecycle row (Discontinued)", /Lifecycle/i.test(motorText) && /Discontinued/i.test(motorText), motorText.replace(/\n/g, " | "));

  const plain = await openPart(page, "Hex nut, M6, 18-8 SS");
  const plainText = await plain.innerText();
  await page.screenshot({ path: `${h.OUT}/${h.TAG}-part-sheet-washer.png` });
  h.check("plain part labels the Part number", /Part number/i.test(plainText), plainText.replace(/\n/g, " | "));
  h.check(
    "plain part with no extra data says so (no invented fields)",
    /No other details on file/i.test(plainText) && !/Vendor|Material|Weight/i.test(plainText),
    plainText.replace(/\n/g, " | "),
  );

  h.writeProof("part-sheet");
  await h.finish(s, "part-sheet");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
