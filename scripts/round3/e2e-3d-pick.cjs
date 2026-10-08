/* eslint-disable @typescript-eslint/no-require-imports */
/* Round 3 / HIGH 1 — clicking the gearmotor or roller must not select the frame behind it. */
const h = require("./harness.cjs");

const DESKTOP = { width: 1440, height: 900 };
// Default Bounds-fit camera is deterministic for this viewport + the seeded palletizer GLB.
const DESKTOP_POINTS = { motor: [619, 548], roller: [422, 408] };
const PHONE_POINTS = { motor: [227, 488], roller: [132, 418] };

async function selectedName(page) {
  await page.waitForTimeout(450);
  return page
    .locator("[data-part-sheet]")
    .first()
    .innerText({ timeout: 1500 })
    .then((t) => t.split("\n")[0].trim())
    .catch(() => "(none)");
}

(async () => {
  const session = await h.launch({ name: "3d-pick", viewport: DESKTOP });
  const { context, page } = session;
  await h.apiLogin(context);
  await page.goto(h.BASE + "/machines/palletizer", { waitUntil: "networkidle" });
  await page.locator("canvas").first().waitFor();
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${h.OUT}/${h.TAG}-3d-pick-initial.png` });

  const motor = DESKTOP_POINTS.motor;
  await page.mouse.click(motor[0], motor[1]);
  const motorName = await selectedName(page);
  await page.screenshot({ path: `${h.OUT}/${h.TAG}-3d-pick-motor.png` });
  h.check("desktop: click gearmotor selects Gearmotor", motorName === "Gearmotor", motorName);

  await page.mouse.click(30, 700);
  const roller = DESKTOP_POINTS.roller;
  await page.mouse.click(roller[0], roller[1]);
  const rollerName = await selectedName(page);
  await page.screenshot({ path: `${h.OUT}/${h.TAG}-3d-pick-roller.png` });
  h.check("desktop: click roller selects Drive roller", rollerName === "Drive roller", rollerName);

  await h.finish(session, "3d-pick-desktop");

  const phone = await h.launch({
    name: "3d-pick-phone",
    viewport: { width: 390, height: 844 },
    mobile: true,
  });
  await h.apiLogin(phone.context);
  await phone.page.goto(h.BASE + "/machines/palletizer", { waitUntil: "networkidle" });
  await phone.page.locator("canvas").first().waitFor();
  await phone.page.waitForTimeout(5000);
  await phone.page.screenshot({ path: `${h.OUT}/${h.TAG}-3d-pick-phone-initial.png` });
  const box = await phone.page.locator("canvas").first().boundingBox();
  await phone.page.touchscreen.tap(PHONE_POINTS.motor[0], PHONE_POINTS.motor[1]);
  const phoneMotor = await selectedName(phone.page);
  await phone.page.screenshot({ path: `${h.OUT}/${h.TAG}-3d-pick-phone-motor.png` });
  h.check("phone: tap gearmotor selects Gearmotor", phoneMotor === "Gearmotor", phoneMotor);
  await phone.page.touchscreen.tap(PHONE_POINTS.roller[0], PHONE_POINTS.roller[1]);
  const phoneRoller = await selectedName(phone.page);
  await phone.page.screenshot({ path: `${h.OUT}/${h.TAG}-3d-pick-phone-roller.png` });
  h.check("phone: tap roller selects Drive roller", phoneRoller === "Drive roller", phoneRoller);
  await h.finish(phone, "3d-pick-phone");
  h.writeProof("3d-pick", { canvas: box });
})();
