/* eslint-disable @typescript-eslint/no-require-imports */
/* Round 3b / HIGH 3 — demo tenant migration runs automatically (no staff POST). */
const h = require("./harness.cjs");

const BUYER = { email: "user@demo.com", password: "Oee360Demo1!" };

(async () => {
  const s = await h.launch({ name: "demo-migration-auto" });
  const { context, page } = s;

  await context.request.get(h.BASE + "/login");
  const login = await context.request.post(h.BASE + "/api/auth/login", { data: BUYER });
  h.check("demo buyer can sign in after auto migration", login.ok(), String(login.status()));

  const after = await context.request.get(h.BASE + "/api/machines/hardware-fixture");
  h.check("buyer can load hardware-fixture API", after.status() === 200, String(after.status()));

  const login2 = await context.request.post(h.BASE + "/api/auth/login", { data: BUYER });
  h.check("second login still works (idempotent migration)", login2.ok(), String(login2.status()));

  await page.goto(h.BASE + "/machines/hardware-fixture", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${h.OUT}/${h.TAG}-demo-migration-buyer.png` });

  h.writeProof("demo-migration-auto");
  await h.finish(s, "demo-migration-auto");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
