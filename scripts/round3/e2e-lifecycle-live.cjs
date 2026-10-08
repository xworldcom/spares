/* eslint-disable @typescript-eslint/no-require-imports */
/* Round 3 / HIGH 3 — on a seed-off ("live-like") server the hardware fixture + lifecycle must be loadable by staff. */
const h = require("./harness.cjs");

const OWNER = { email: "owner@live.test", password: "LiveOwner12345!" };
const BUYER = { email: "live-buyer@demo.test", password: "LiveBuyer12345!" };

(async () => {
  const s = await h.launch({ name: "lifecycle-live" });
  const { context, page, browser } = s;
  await h.apiLogin(context, OWNER);

  const before = await context.request.get(h.BASE + "/api/machines/hardware-fixture");
  h.check("live-like: hardware-fixture is 404 before the migration", before.status() === 404, String(before.status()));

  const run1 = await context.request.post(h.BASE + "/api/staff/part-lifecycle/demo-fixture");
  const body1 = await run1.json().catch(() => ({}));
  h.check("staff migration endpoint succeeds", run1.status() === 200 && body1.machineCreated === true, `${run1.status()} ${JSON.stringify(body1)}`);
  const run2 = await context.request.post(h.BASE + "/api/staff/part-lifecycle/demo-fixture");
  const body2 = await run2.json().catch(() => ({}));
  h.check("migration is idempotent", run2.status() === 200 && body2.machineCreated === false && body2.lifecycleAdded?.length === 0, JSON.stringify(body2));

  const after = await context.request.get(h.BASE + "/api/machines/hardware-fixture");
  h.check("hardware-fixture now loads", after.status() === 200, String(after.status()));
  const catalog = await (await context.request.get(h.BASE + "/api/staff/part-lifecycle?status=all")).json();
  const by = Object.fromEntries((catalog.parts ?? []).map((p) => [p.partNumber, p.lifecycle?.status]));
  h.check("lifecycle rows present (6331K32 obsolete, 5972K325 announced)", by["6331K32"] === "obsolete" && by["5972K325"] === "announced", JSON.stringify(by));

  const customer = await context.request.post(h.BASE + "/api/staff/customers", {
    data: { ...BUYER, name: "Live buyer", machineIds: ["hardware-fixture"] },
  });
  h.check("created a real (non-seed) buyer", customer.ok(), String(customer.status()));

  const buyerCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const login = await buyerCtx.request.post(h.BASE + "/api/auth/login", { data: BUYER });
  h.check("buyer can sign in", login.ok(), String(login.status()));
  await buyerCtx.close();

  // Buyer view in the same recorded page.
  await context.clearCookies();
  await h.apiLogin(context, BUYER);
  await page.goto(h.BASE + "/machines/hardware-fixture", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${h.OUT}/${h.TAG}-lifecycle-live-buyer.png` });
  const text = await page.locator("body").innerText();
  h.check("buyer sees the Hardware fixture machine page", /Hardware fixture/i.test(text) && !/not found/i.test(text), text.slice(0, 120).replace(/\n/g, " "));

  h.writeProof("lifecycle-live");
  await h.finish(s, "lifecycle-live");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
