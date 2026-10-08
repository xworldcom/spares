/* eslint-disable @typescript-eslint/no-require-imports */
/* Round 3 / HIGH 3 — seed-off server auto-migrates demo tenant data (no staff POST). */
const h = require("./harness.cjs");

const BUYER = { email: "user@demo.com", password: "Oee360Demo1!" };

(async () => {
  const s = await h.launch({ name: "lifecycle-live" });
  const { context, page } = s;

  await context.request.get(h.BASE + "/api/auth/me");

  const login = await context.request.post(h.BASE + "/api/auth/login", { data: BUYER });
  h.check("demo buyer can sign in after auto migration", login.ok(), String(login.status()));

  const after = await context.request.get(h.BASE + "/api/machines/hardware-fixture");
  h.check("hardware-fixture loads for buyer", after.status() === 200, String(after.status()));

  await h.apiLogin(context, BUYER);
  await page.goto(h.BASE + "/machines/hardware-fixture", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${h.OUT}/${h.TAG}-lifecycle-live-buyer.png` });
  const text = await page.locator("body").innerText();
  h.check(
    "buyer sees the Hardware fixture machine page",
    /Hardware fixture/i.test(text) && !/not found/i.test(text),
    text.slice(0, 120).replace(/\n/g, " "),
  );

  h.writeProof("lifecycle-live");
  await h.finish(s, "lifecycle-live");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
