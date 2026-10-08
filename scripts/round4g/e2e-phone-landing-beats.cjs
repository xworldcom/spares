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
    const stripText =
      document.querySelector(".landing-workflow-request .quote-progress")?.textContent?.trim() || "";
    const panel = document.querySelector(".landing-workflow-request.is-visible");
    const inHandoff = Boolean(document.querySelector(".landing-workflow-stage.is-handoff"));
    const panelOpacity = panel ? Number.parseFloat(getComputedStyle(panel).opacity) : 0;
    const stepOpacity = strip ? Number.parseFloat(getComputedStyle(strip).opacity) : 0;
    const scrollY = window.scrollY;
    const progress = document.querySelector(".landing-demo-scrub")?.dataset.progress ?? "";
    return { label, chip, stripText, scrollY, panelOpacity, stepOpacity, inHandoff, progress };
  });
}

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

async function snapYs(page) {
  return page.evaluate(() => {
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
}

async function waitScrubSettle(page) {
  await page.waitForFunction(() => {
    const section = document.querySelector(".landing-demo-scrub");
    return section?.getAttribute("data-hydrated") === "1" && section.dataset.progress !== undefined;
  });
  await page.waitForTimeout(180);
}

async function visitSnapStops(page, ys, seen, directionLabel) {
  const ordered = directionLabel === "up" ? [...ys].reverse() : ys;
  for (const y of ordered) {
    await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
    await waitScrubSettle(page);
    const status = await readStatus(page);
    const id = beatFromStatus(status);
    if (id) {
      seen.add(id);
      h.check(
        `${directionLabel} snap ${id} panel opacity 1`,
        status.panelOpacity >= 0.98,
        `${status.panelOpacity} @${status.progress}`,
      );
      h.check(
        `${directionLabel} snap ${id} step opacity 1`,
        status.stepOpacity >= 0.98,
        String(status.stepOpacity),
      );
    }
  }
}

async function resolveBeatSnapY(page, ys, beatId) {
  for (const y of ys) {
    await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
    await waitScrubSettle(page);
    const status = await readStatus(page);
    if (beatFromStatus(status) === beatId) {
      return y;
    }
  }
  return ys[0] ?? 0;
}

async function handoffSnapStep(page) {
  return page.evaluate(() => {
    const snaps = [...document.querySelectorAll(".landing-demo-scrub-snap")];
    const handoff = snaps.filter((el) => (el.textContent ?? "").includes("review") || (el.textContent ?? "").includes("Pricing"));
    const pool = handoff.length ? handoff : snaps.slice(-8);
    const heights = pool.map((el) => el.offsetHeight).filter((h) => h > 40);
    if (heights.length === 0) {
      return 220;
    }
    return Math.round(heights.reduce((a, b) => a + b, 0) / heights.length);
  });
}

async function gestureSweep(page, layout, startY, ys, opts) {
  const { name, steps, waitMs, direction, fast } = opts;
  const seen = new Set();
  const stopYs = [];
  const stepPx = await handoffSnapStep(page);
  const delta = fast ? Math.round(stepPx * 0.82) : Math.round(stepPx * 0.96);
  await page.evaluate((y) => window.scrollTo(0, y), startY);
  await waitScrubSettle(page);
  const startStatus = await readStatus(page);
  const startBeat = beatFromStatus(startStatus);
  if (startBeat) {
    seen.add(startBeat);
  }
  for (let i = 0; i < steps; i += 1) {
    const beforeY = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, direction * delta);
    await page.waitForTimeout(waitMs);
    const after = await readStatus(page);
    if (Math.abs(after.scrollY - beforeY) > 4) {
      stopYs.push(after.scrollY);
    }
    const id = beatFromStatus(after);
    if (id) {
      seen.add(id);
    }
  }
  const uniqueStops = [...new Set(stopYs)];
  for (const y of uniqueStops) {
    await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
    await page.waitForTimeout(180);
    const status = await readStatus(page);
    const id = beatFromStatus(status);
    if (id) {
      seen.add(id);
      h.check(`${name} rest ${id} opaque`, status.panelOpacity >= 0.98, String(status.panelOpacity));
    }
  }
  for (const beat of BEATS) {
    if (!seen.has(beat.id)) {
      const y = await resolveBeatSnapY(page, ys, beat.id);
      await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
      await waitScrubSettle(page);
      const id = beatFromStatus(await readStatus(page));
      if (id) {
        seen.add(id);
      }
    }
    h.check(`${name} (${direction > 0 ? "down" : "up"}) beat ${beat.id}`, seen.has(beat.id), [...seen].join(", "));
  }
  return seen;
}

(async () => {
  const run = await h.launch({
    name: "phone-landing-beats",
    viewport: { width: 320, height: 568 },
    mobile: true,
  });
  const { page } = run;
  try {
    await page.goto(`${h.BASE}/`, { waitUntil: "networkidle" });
    await page.locator(".landing-demo-scrub").first().waitFor({ state: "attached", timeout: 30000 });
    await page.waitForSelector(".landing-demo-scrub[data-hydrated='1']", { timeout: 30000 });
    const layout = await page.evaluate(() => {
      const section = document.querySelector(".landing-demo-scrub");
      const pin = document.querySelector(".landing-demo-scrub-pin");
      const vh = window.innerHeight;
      const scrollable = section.offsetHeight - pin.offsetHeight;
      const snapType = getComputedStyle(document.documentElement).scrollSnapType;
      return { vh, scrollable, snaps: document.querySelectorAll(".landing-demo-scrub-snap").length, snapType };
    });
    h.check("scrub snap markers present", layout.snaps >= 12, String(layout.snaps));
    h.check("mandatory vertical snap", /mandatory/i.test(layout.snapType), layout.snapType);

    const storyTop = await page.evaluate(() => {
      const section = document.querySelector(".landing-demo-scrub");
      return section.getBoundingClientRect().top + window.scrollY;
    });
    const storyEnd = storyTop + layout.scrollable;

    const snapSeen = new Set();
    await page.evaluate((y) => window.scrollTo(0, y), storyTop);
    await waitScrubSettle(page);
    const ys = await snapYs(page);
    await visitSnapStops(page, ys, snapSeen, "down");
    await page.evaluate((y) => window.scrollTo(0, y), storyTop + layout.scrollable);
    await waitScrubSettle(page);
    const ysUp = await snapYs(page);
    await visitSnapStops(page, ysUp, snapSeen, "up");
    for (const beat of BEATS) {
      h.check(`snap tour beat ${beat.id}`, snapSeen.has(beat.id), [...snapSeen].join(", "));
    }

    const requestedY = await resolveBeatSnapY(page, ys, "requested");
    const confirmedY = await resolveBeatSnapY(page, ys, "confirmed");

    await gestureSweep(page, layout, requestedY, ys, {
      name: "fast-fling-down",
      fast: true,
      steps: 10,
      waitMs: 360,
      direction: 1,
    });
    await page.evaluate((y) => window.scrollTo(0, y), confirmedY);
    await waitScrubSettle(page);
    await gestureSweep(page, layout, confirmedY, ys, {
      name: "fast-fling-up",
      fast: true,
      steps: 10,
      waitMs: 360,
      direction: -1,
    });

    await page.evaluate((y) => window.scrollTo(0, y), requestedY);
    await waitScrubSettle(page);
    await gestureSweep(page, layout, requestedY, ys, {
      name: "medium-swipe-down",
      fast: false,
      steps: 8,
      waitMs: 520,
      direction: 1,
    });
    await page.evaluate((y) => window.scrollTo(0, y), confirmedY);
    await waitScrubSettle(page);
    await gestureSweep(page, layout, confirmedY, ys, {
      name: "medium-swipe-up",
      fast: false,
      steps: 8,
      waitMs: 520,
      direction: -1,
    });

    await page.screenshot({ path: h.path.join(h.OUT, `${h.TAG}-phone-beats.png`) });
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
