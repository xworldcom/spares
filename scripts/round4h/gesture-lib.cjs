/* eslint-disable @typescript-eslint/no-require-imports */
const BEATS = [
  { id: "requested", match: /Requested/i },
  { id: "in_review", match: /In review/i },
  { id: "pricing", match: /Pricing/i },
  { id: "quoted", match: /Quoted/i },
  { id: "po_received", match: /PO received/i },
  { id: "confirmed", match: /Confirmed/i },
];

const CHIP_CHECKS = [
  { id: "po_received", match: /PO received/i },
  { id: "in_review", match: /In review/i },
];

async function waitScrubSettle(page, timeoutMs = 2400) {
  await page.waitForFunction(() => {
    const section = document.querySelector(".landing-demo-scrub");
    return section?.getAttribute("data-hydrated") === "1" && section.dataset.progress !== undefined;
  });
  let lastY = -1;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const y = await page.evaluate(() => window.scrollY);
    if (Math.abs(y - lastY) < 1 && lastY >= 0) {
      await page.waitForTimeout(120);
      return;
    }
    lastY = y;
    await page.waitForTimeout(80);
  }
}

function readStatus(page) {
  return page.evaluate(() => {
    const scrub = document.querySelector(".landing-demo-scrub");
    const activeQuoteStatus = scrub?.dataset.activeQuoteStatus ?? "";
    const strip = document.querySelector(
      ".landing-workflow-request .quote-progress-step[data-state='current']",
    );
    const label =
      strip?.querySelector(".quote-progress-label-full")?.textContent?.trim() ||
      strip?.querySelector(".quote-progress-label")?.textContent?.trim() ||
      "";
    const chipEl = document.querySelector(".landing-workflow-request .status-pill");
    const chip = chipEl?.textContent?.trim() || "";
    const panel = document.querySelector(".landing-workflow-request.is-visible");
    const inHandoff = Boolean(document.querySelector(".landing-workflow-stage.is-handoff"));
    const panelOpacity = panel ? Number.parseFloat(getComputedStyle(panel).opacity) : 0;
    const stepOpacity = strip ? Number.parseFloat(getComputedStyle(strip).opacity) : 0;
    const chipNowrap = chipEl ? getComputedStyle(chipEl).whiteSpace : "";
    const progress = document.querySelector(".landing-demo-scrub")?.dataset.progress ?? "";
    const snapStopSamples = [...document.querySelectorAll(".landing-demo-scrub-snap, .landing-demo-beat-track")]
      .slice(0, 4)
      .map((el) => getComputedStyle(el).scrollSnapStop);
    return {
      label,
      chip,
      activeQuoteStatus,
      scrollY: window.scrollY,
      panelOpacity,
      stepOpacity,
      chipNowrap,
      inHandoff,
      progress,
      snapStopSamples,
    };
  });
}

function inHandoffChapter(status) {
  return status.inHandoff || Number(status.progress) >= 0.42;
}

const STATUS_TO_BEAT = {
  requested: "requested",
  in_review: "in_review",
  pricing: "pricing",
  quoted: "quoted",
  po_received: "po_received",
  confirmed: "confirmed",
};

async function readRestBeat(page) {
  return page.evaluate(() => {
    const header = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--spares-header"));
    const anchor = (Number.isFinite(header) ? header : 56) + 6;
    const tracks = [...document.querySelectorAll(".landing-demo-beat-track")];
    let best = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const track of tracks) {
      const dist = Math.abs(track.getBoundingClientRect().top - anchor);
      if (dist < bestDist) {
        bestDist = dist;
        best = track.dataset.quoteStatus ?? null;
      }
    }
    return best;
  });
}

function beatFromStatus(status) {
  if (!inHandoffChapter(status)) {
    return null;
  }
  const fromDataset = STATUS_TO_BEAT[status.activeQuoteStatus];
  if (fromDataset) {
    return fromDataset;
  }
  for (const beat of BEATS) {
    if (beat.match.test(status.label) || beat.match.test(status.chip)) {
      return beat.id;
    }
  }
  if (/^review$/i.test(status.label) || /^review$/i.test(status.chip)) {
    return "in_review";
  }
  return null;
}

async function cdpSession(page) {
  const client = await page.context().newCDPSession(page);
  return client;
}

async function touchSwipe(page, { x, y, yDistance, speed }) {
  const client = await cdpSession(page);
  const distance = Math.abs(yDistance);
  const fingerUp = yDistance > 0;
  const yStart = fingerUp ? y + distance * 0.35 : y - distance * 0.35;
  const yEnd = fingerUp ? y - distance * 0.65 : y + distance * 0.65;
  const steps = Math.max(8, Math.round(distance / 28));
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y: yStart }],
  });
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: yStart + (yEnd - yStart) * t }],
    });
    await page.waitForTimeout(Math.max(8, Math.round(220 / speed)));
  }
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  const before = await page.evaluate(() => window.scrollY);
  await page.waitForTimeout(90);
  const afterTouch = await page.evaluate(() => window.scrollY);
  if (Math.abs(afterTouch - before) < 6) {
    await page.mouse.wheel(0, yDistance);
  }
}

async function realGestureSweep(page, layout, opts) {
  const { name, direction, fast, steps, viewport } = opts;
  const seen = new Set();
  const cx = Math.round(viewport.width / 2);
  const cy = Math.round(viewport.height * 0.62);
  const trackStep = await page.evaluate(() => {
    const track = document.querySelector(".landing-demo-beat-track");
    return track?.offsetHeight ?? window.innerHeight * 0.75;
  });
  const stepPx = Math.round(trackStep * (fast ? 0.86 : 0.72));
  const yDistance = direction > 0 ? stepPx : -stepPx;
  const speed = fast ? 820 : 500;

  const start = await readStatus(page);
  const startBeat = beatFromStatus(start);
  if (startBeat) {
    seen.add(startBeat);
  }

  for (let i = 0; i < steps; i += 1) {
    await touchSwipe(page, { x: cx, y: cy, yDistance, speed });
    await waitScrubSettle(page);
    const status = await readStatus(page);
    const geom = await readRestBeat(page);
    const fromGeom = STATUS_TO_BEAT[geom];
    const fromUi = beatFromStatus(status);
    const id = fromGeom || fromUi;
    if (fromGeom) {
      seen.add(fromGeom);
    }
    if (fromUi) {
      seen.add(fromUi);
    }
    if (id) {
      const h = opts.h;
      if (status.inHandoff) {
        h.check(`${name} rest ${id} panel opaque`, status.panelOpacity >= 0.98, String(status.panelOpacity));
        h.check(`${name} rest ${id} step opaque`, status.stepOpacity >= 0.98, String(status.stepOpacity));
      }
    }
  }

  for (const beat of BEATS) {
    opts.h.check(
      `${name} (${direction > 0 ? "down" : "up"}) beat ${beat.id}`,
      seen.has(beat.id),
      [...seen].join(", "),
    );
  }
  return seen;
}

async function assertSnapStopAlways(page, h) {
  const stops = await page.evaluate(() =>
    [...document.querySelectorAll(".landing-demo-scrub-snap, .landing-demo-beat-track")].map((el) =>
      getComputedStyle(el).scrollSnapStop,
    ),
  );
  h.check("snap markers scroll-snap-stop always", stops.length >= 8 && stops.every((s) => s === "always"), stops.join(","));
}

async function assertChipNowrapAtBeats(page, h) {
  for (const spec of CHIP_CHECKS) {
    await page.evaluate((statusKey) => {
      const track = document.querySelector(`.landing-demo-beat-track[data-quote-status="${statusKey}"]`);
      if (!track) {
        return;
      }
      const y = track.getBoundingClientRect().top + window.scrollY;
      window.scrollTo(0, y);
    }, spec.id);
    await waitScrubSettle(page, 3200);
    const nowrap = await page.evaluate(() => {
      const pill = document.querySelector(".landing-workflow-request .status-pill");
      return pill ? getComputedStyle(pill).whiteSpace : "missing";
    });
    h.check(`chip nowrap ${spec.id}`, nowrap === "nowrap", String(nowrap));
  }
}

module.exports = {
  BEATS,
  waitScrubSettle,
  readStatus,
  readRestBeat,
  beatFromStatus,
  touchSwipe,
  realGestureSweep,
  assertSnapStopAlways,
  assertChipNowrapAtBeats,
};
