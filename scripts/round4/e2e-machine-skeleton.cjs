/* eslint-disable @typescript-eslint/no-require-imports */
const h = require("./harness.cjs");

async function main() {
  const run = await h.launch({ name: "machine-skeleton" });
  const { page } = run;
  try {
    await h.apiLogin(run.context);
    await page.route("**/api/machines/hardware-fixture", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      await route.continue();
    });
    await page.goto(`${h.BASE}/machines/hardware-fixture`, { waitUntil: "domcontentloaded" });
    const skeleton = page.locator('[aria-label="Loading machine"][aria-busy="true"]');
    await skeleton.waitFor({ state: "visible", timeout: 10000 });
    await page.screenshot({ path: h.path.join(h.OUT, `${h.TAG}-machine-skeleton.png`) });
    h.check("skeleton shown while machine loads", true);
    h.check("plain loading text is gone", (await page.getByText("Loading machine…").count()) === 0);
    await skeleton.waitFor({ state: "detached", timeout: 20000 });
  } finally {
    await h.finish(run);
  }
  if (h.checks.some((c) => !c.ok)) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
