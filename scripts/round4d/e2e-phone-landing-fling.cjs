/* eslint-disable @typescript-eslint/no-require-imports */
const { h, finishAndExit } = require("./common.cjs");

const BEATS = [
  { id: "requested", match: /Requested/i },
  { id: "in_review", match: /In review/i },
  { id: "pricing", match: /Pricing/i },
  { id: "quoted", match: /Quoted/i },
  { id: "po_received", match: /PO received/i },
  { id: "confirmed", match: /Confirmed/i },
];

(async () => {
  const run = await h.launch({
    name: "phone-landing-fling",
    viewport: { width: 320, height: 568 },
    mobile: true,
  });
  const { page } = run;
  try {
    await page.goto(`${h.BASE}/`, { waitUntil: "networkidle" });
    await page.locator(".landing-demo-scrub").first().waitFor({ state: "attached", timeout: 30000 });
    const layout = await page.evaluate(() => {
      const section = document.querySelector(".landing-demo-scrub");
      const pin = document.querySelector(".landing-demo-scrub-pin");
      const vh = window.innerHeight;
      const scrollable = section.offsetHeight - pin.offsetHeight;
      return { vh, scrollable, snaps: document.querySelectorAll(".landing-demo-scrub-snap").length };
    });
    console.log(JSON.stringify(layout));
    h.check("scrub snap markers present", layout.snaps > 8, String(layout.snaps));

    const storyTop = await page.evaluate(() => {
      const section = document.querySelector(".landing-demo-scrub");
      return section.getBoundingClientRect().top + window.scrollY;
    });

    const seen = new Set();
    const steps = 28;
    for (let i = 0; i <= steps; i += 1) {
      const y = storyTop + (layout.scrollable * i) / steps;
      await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
      await page.waitForTimeout(40);
      const statuses = await page.evaluate(() => {
        const strip = document.querySelector(".landing-workflow-request .quote-progress-step[data-state='current']");
        const label =
          strip?.querySelector(".quote-progress-label-full")?.textContent?.trim() ||
          strip?.querySelector(".quote-progress-label")?.textContent?.trim() ||
          "";
        const chip = document.querySelector(".landing-workflow-request .status-pill")?.textContent?.trim() || "";
        return { label, chip };
      });
      for (const beat of BEATS) {
        if (beat.match.test(statuses.label) || beat.match.test(statuses.chip)) {
          seen.add(beat.id);
        }
      }
    }

    await page.mouse.wheel(0, layout.scrollable);
    await page.waitForTimeout(500);
    const afterFling = await page.evaluate(() => ({
      progress: document.querySelector(".landing-demo-scrub")?.dataset.progress,
      step: document.querySelector("[data-demo='workflow']")?.getAttribute("data-step"),
    }));
    console.log(JSON.stringify({ seen: [...seen], afterFling }));

    for (const beat of BEATS) {
      h.check(`beat visible while scrubbing: ${beat.id}`, seen.has(beat.id), [...seen].join(", "));
    }
    h.check("fast fling does not leave workflow at hub", afterFling.step !== "hub", afterFling.step ?? "missing");
    await page.screenshot({ path: h.path.join(h.OUT, `${h.TAG}-phone-fling.png`) });
  } catch (e) {
    console.error(e);
    h.check("script completed without error", false, String(e).split("\n")[0]);
  } finally {
    await finishAndExit(run);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
