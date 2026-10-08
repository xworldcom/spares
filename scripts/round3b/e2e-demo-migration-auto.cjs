/* eslint-disable @typescript-eslint/no-require-imports */
/* Round 3b / HIGH 3 — demo tenant migration runs automatically (no staff POST). */
const h = require("./harness.cjs");

const BUYER_EMAIL = "user@demo.com";

function buyerCreds() {
  const password = process.env.SPARES_DEMO_BUYER_PASSWORD?.trim();
  if (!password) {
    return null;
  }
  return { email: BUYER_EMAIL, password };
}

(async () => {
  const s = await h.launch({ name: "demo-migration-auto" });
  const { context, page } = s;

  await context.request.get(h.BASE + "/login");
  const creds = buyerCreds();
  if (creds) {
    const login = await context.request.post(h.BASE + "/api/auth/login", { data: creds });
    h.check("demo buyer can sign in after auto migration", login.ok(), String(login.status()));

    const after = await context.request.get(h.BASE + "/api/machines/hardware-fixture");
    h.check("buyer can load hardware-fixture API", after.status() === 200, String(after.status()));

    const login2 = await context.request.post(h.BASE + "/api/auth/login", { data: creds });
    h.check("second login still works (idempotent migration)", login2.ok(), String(login2.status()));

    await page.goto(h.BASE + "/machines/hardware-fixture", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${h.OUT}/${h.TAG}-demo-migration-buyer.png` });
  } else {
    h.check(
      "SPARES_DEMO_BUYER_PASSWORD unset — skipped buyer login (migration does not create users)",
      true,
      "skipped",
    );
  }

  h.writeProof("demo-migration-auto");
  await h.finish(s, "demo-migration-auto");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
