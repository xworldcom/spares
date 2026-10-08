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

function inHandoffChapter(status) {
  return status.inHandoff || Number(status.progress) >= 0.505;
}

function beatFromStatus(status) {
  if (!inHandoffChapter(status)) {
    return null;
  }
  for (const beat of BEATS) {
    if (beat.match.test(status.label) || beat.match.test(status.chip)) {
      return beat.id;
    }
  }
  return null;
}

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
    const progress = document.querySelector(".landing-demo-scrub")?.dataset.progress ?? "";
    const inHandoff = Boolean(document.querySelector(".landing-workflow-stage.is-handoff"));
    return { label, chip, scrollY: window.scrollY, progress, inHandoff };
  });
}

(async () => {
  const run = await h.launch({
    name: "desktop-pagedown",
    viewport: { width: 1440, height: 900 },
    mobile: false,
  });
  const { page } = run;
  try {
    await page.goto(`${h.BASE}/`, { waitUntil: "networkidle" });
    await page.locator(".landing-demo-scrub").first().waitFor({ state: "attached", timeout: 30000 });
    await page.waitForSelector(".landing-demo-scrub[data-hydrated='1']", { timeout: 30000 });
    await page.waitForTimeout(200);
    const layout = await page.evaluate(() => {
      const section = document.querySelector(".landing-demo-scrub");
      const pin = document.querySelector(".landing-demo-scrub-pin");
      return {
        scrollable: section.offsetHeight - pin.offsetHeight,
        vh: window.innerHeight,
      };
    });

    const storyTop = await page.evaluate(() => {
      const section = document.querySelector(".landing-demo-scrub");
      return section.getBoundingClientRect().top + window.scrollY;
    });
    await page.evaluate((y) => window.scrollTo(0, y), storyTop);
    await page.waitForTimeout(200);

    const snapYs = await page.evaluate(() => {
      const section = document.querySelector(".landing-demo-scrub");
      let y = section.getBoundingClientRect().top + window.scrollY;
      const ys = [y];
      for (const snap of section.querySelectorAll(".landing-demo-scrub-snap")) {
        y += snap.offsetHeight;
        ys.push(y);
      }
      return ys;
    });

    const minProgressStep = 0.028;
    const seen = new Set();
    const progressDeltas = [];
    let prev = await readStatus(page);
    for (let i = 0; i < 14; i += 1) {
      await page.keyboard.press("PageDown");
      await page.waitForTimeout(320);
      const next = await readStatus(page);
      const dp = Math.abs(Number.parseFloat(next.progress) - Number.parseFloat(prev.progress));
      if (dp > 0.001) {
        progressDeltas.push(dp);
      }
      const id = beatFromStatus(next);
      if (id) {
        seen.add(id);
      }
      prev = next;
    }

    const meaningful = progressDeltas.filter((d) => d >= minProgressStep);
    h.check(
      "PageDown advances scrub progress meaningfully",
      meaningful.length >= 3,
      `deltas=${progressDeltas.map((d) => d.toFixed(3)).join(",")}`,
    );
    h.check(
      "PageDown does not stall at zero",
      progressDeltas.filter((d) => d > 0.005).length >= 6,
      progressDeltas.map((d) => d.toFixed(3)).join(","),
    );

    for (const y of snapYs) {
      await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
      await page.waitForTimeout(280);
      const status = await readStatus(page);
      const id = beatFromStatus(status);
      if (id) {
        seen.add(id);
      }
    }

    await page.evaluate((y) => window.scrollTo(0, y), storyTop + layout.scrollable);
    await page.waitForTimeout(200);
    const upSeen = new Set();
    for (let i = 0; i < 14; i += 1) {
      await page.keyboard.press("PageUp");
      await page.waitForTimeout(320);
      const status = await readStatus(page);
      const id = beatFromStatus(status);
      if (id) {
        upSeen.add(id);
      }
    }
    for (const y of [...snapYs].reverse()) {
      await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
      await page.waitForTimeout(220);
      const status = await readStatus(page);
      const id = beatFromStatus(status);
      if (id) {
        upSeen.add(id);
      }
    }

    for (const beat of BEATS) {
      h.check(`PageDown tour beat ${beat.id}`, seen.has(beat.id), [...seen].join(", "));
      h.check(`PageUp tour beat ${beat.id}`, upSeen.has(beat.id), [...upSeen].join(", "));
    }

    await page.screenshot({ path: h.path.join(h.OUT, `${h.TAG}-desktop-pagedown.png`) });
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
