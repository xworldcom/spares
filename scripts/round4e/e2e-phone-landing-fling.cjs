/* eslint-disable @typescript-eslint/no-require-imports */
const { h, finishAndExit } = require("./common.cjs");

const BEATS = [
  { id: "requested", match: /Requested|Request/i },
  { id: "in_review", match: /In review|Review/i },
  { id: "pricing", match: /Pricing/i },
  { id: "quoted", match: /Quoted/i },
  { id: "po_received", match: /PO received/i },
  { id: "confirmed", match: /Confirmed/i },
];

function readStatus(page) {
  return page.evaluate(() => {
    const strip = document.querySelector(
      ".landing-workflow-request .quote-progress-step[data-state='current']",
    );
    const label =
      strip?.querySelector(".quote-progress-label-full")?.textContent?.trim() ||
      strip?.querySelector(".quote-progress-label")?.textContent?.trim() ||
      "";
    const chip = document.querySelector(".landing-workflow-request .status-pill")?.textContent?.trim() || "";
    const scrollY = window.scrollY;
    return { label, chip, scrollY };
  });
}

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
      const snapType = getComputedStyle(document.documentElement).scrollSnapType;
      return { vh, scrollable, snaps: document.querySelectorAll(".landing-demo-scrub-snap").length, snapType };
    });
    console.log(JSON.stringify(layout));
    h.check("scrub snap markers present", layout.snaps > 8, String(layout.snaps));
    h.check("mandatory vertical snap on landing", /mandatory/i.test(layout.snapType), layout.snapType);

    const storyTop = await page.evaluate(() => {
      const section = document.querySelector(".landing-demo-scrub");
      return section.getBoundingClientRect().top + window.scrollY;
    });

    const seen = new Set();
    const flingStops = [];
    await page.evaluate((y) => window.scrollTo(0, y), storyTop);
    await page.waitForTimeout(120);
    for (let fling = 0; fling < 18; fling += 1) {
      const beforeY = await page.evaluate(() => window.scrollY);
      const delta = fling < 12 ? Math.round(layout.vh * 0.85) : Math.round(layout.vh * 0.42);
      await page.mouse.wheel(0, delta);
      await page.waitForTimeout(fling < 12 ? 380 : 520);
      const after = await readStatus(page);
      if (after.scrollY > beforeY + 6) {
        flingStops.push(after.scrollY);
      }
      for (const beat of BEATS) {
        if (beat.match.test(after.label) || beat.match.test(after.chip)) {
          seen.add(beat.id);
        }
      }
    }

    const uniqueStops = [...new Set(flingStops)];
    const snapYs = await page.evaluate(() => {
      const section = document.querySelector(".landing-demo-scrub");
      if (!section) {
        return [];
      }
      let y = section.getBoundingClientRect().top + window.scrollY;
      const ys = [y];
      for (const snap of section.querySelectorAll(".landing-demo-scrub-snap")) {
        y += snap.offsetHeight;
        ys.push(y);
      }
      return ys;
    });
    for (const stopY of [...uniqueStops, ...snapYs]) {
      await page.evaluate((y) => window.scrollTo(0, y), stopY);
      await page.waitForTimeout(160);
      const atStop = await readStatus(page);
      for (const beat of BEATS) {
        if (beat.match.test(atStop.label) || beat.match.test(atStop.chip)) {
          seen.add(beat.id);
        }
      }
    }

    const afterFling = await page.evaluate(() => ({
      progress: document.querySelector(".landing-demo-scrub")?.dataset.progress,
      step: document.querySelector("[data-demo='workflow']")?.getAttribute("data-step"),
      scrollY: window.scrollY,
    }));
    console.log(JSON.stringify({ seen: [...seen], uniqueStops, afterFling }));

    h.check("fast flings advance through snap stops", uniqueStops.length >= 4, uniqueStops.join(","));

    for (const beat of BEATS) {
      h.check(`beat stop during fling: ${beat.id}`, seen.has(beat.id), [...seen].join(", "));
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
