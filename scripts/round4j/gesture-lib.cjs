/* eslint-disable @typescript-eslint/no-require-imports */
const ORDERED_STATUSES = [
  "requested",
  "in_review",
  "pricing",
  "quoted",
  "po_received",
  "confirmed",
];

async function waitScrubSettle(page, timeoutMs = 2800) {
  await page.waitForFunction(() => {
    const section = document.querySelector(".landing-demo-scrub");
    return section?.getAttribute("data-hydrated") === "1" && section.dataset.progress !== undefined;
  });
  let lastY = -1;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const y = await page.evaluate(() => window.scrollY);
    if (Math.abs(y - lastY) < 1 && lastY >= 0) {
      await page.waitForTimeout(140);
      return;
    }
    lastY = y;
    await page.waitForTimeout(80);
  }
}

async function readActiveQuoteStatus(page) {
  return page.evaluate(() => {
    const scrub = document.querySelector(".landing-demo-scrub");
    return scrub?.dataset.activeQuoteStatus ?? "";
  });
}

async function cdpSession(page) {
  return page.context().newCDPSession(page);
}

async function touchSwipe(page, { x, y, yDistance, speed }, h, gestureLabel) {
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
  await page.waitForTimeout(120);
  const afterTouch = await page.evaluate(() => window.scrollY);
  const moved = Math.abs(afterTouch - before) >= 4;
  if (h) {
    h.check(
      `${gestureLabel} touch scroll moved`,
      moved,
      `before=${before} after=${afterTouch}`,
    );
  }
  return moved;
}

/** Fast fling — reproduces buyer skips when snap-stop alone is insufficient. */
async function touchFling(page, { x, y, yDistance }, h, gestureLabel) {
  const client = await cdpSession(page);
  const distance = Math.abs(yDistance);
  const fingerUp = yDistance > 0;
  const yStart = fingerUp ? y + distance * 0.22 : y - distance * 0.22;
  const yEnd = fingerUp ? y - distance * 0.92 : y + distance * 0.92;
  const steps = 6;
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
    await page.waitForTimeout(6);
  }
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await waitScrubSettle(page, 3200);
  const afterTouch = await page.evaluate(() => window.scrollY);
  if (h) {
    h.check(`${gestureLabel} fling moved`, afterTouch >= 0, String(afterTouch));
  }
  return afterTouch;
}

function dedupeConsecutive(sequence) {
  return sequence.filter((status, index) => index === 0 || status !== sequence[index - 1]);
}

function assertMonotonicSequence(h, name, sequence, direction) {
  const order = ORDERED_STATUSES;
  const steps = dedupeConsecutive(sequence);
  let expectIdx = direction > 0 ? order.indexOf(steps[0] ?? "") : order.indexOf(steps[0] ?? "");
  if (expectIdx < 0) {
    expectIdx = direction > 0 ? 0 : order.length - 1;
  }
  const seen = [];
  for (const status of steps) {
    if (!status || !order.includes(status)) {
      h.check(`${name} status in handoff set`, false, String(status));
      continue;
    }
    seen.push(status);
    const idx = order.indexOf(status);
    h.check(
      `${name} step ${seen.length} no skip (${direction > 0 ? "down" : "up"})`,
      idx === expectIdx,
      `got ${status} expected ${order[expectIdx]}`,
    );
    expectIdx += direction;
  }
  h.check(
    `${name} visited all six statuses`,
    seen.length >= 6 && new Set(seen).size === 6,
    seen.join(" → "),
  );
}

async function realGestureBeatTour(page, opts) {
  const { h, name, direction, gestures, viewport, fling = false } = opts;
  const cx = Math.round(viewport.width / 2);
  const cy = Math.round(viewport.height * 0.62);
  const trackStep = await page.evaluate(() => {
    const track = document.querySelector(".landing-demo-beat-track");
    return track?.offsetHeight ?? window.innerHeight * 0.55;
  });
  const stepPx = Math.round(trackStep * (direction > 0 ? 0.62 : 0.88));
  const yDistance = direction > 0 ? stepPx : -stepPx;
  const speed = 520;
  const sequence = [];

  const startStatus = await readActiveQuoteStatus(page);
  if (startStatus) {
    sequence.push(startStatus);
  }

  const target = direction > 0 ? ORDERED_STATUSES.at(-1) : ORDERED_STATUSES[0];
  for (let i = 0; i < gestures; i += 1) {
    if (sequence[sequence.length - 1] === target) {
      break;
    }
    if (fling) {
      await touchFling(page, { x: cx, y: cy, yDistance }, h, `${name} fling ${i + 1}`);
    } else {
      const moved = await touchSwipe(
        page,
        { x: cx, y: cy, yDistance, speed },
        h,
        `${name} gesture ${i + 1}`,
      );
      if (!moved) {
        break;
      }
      await waitScrubSettle(page);
    }
    const status = await readActiveQuoteStatus(page);
    if (!status) {
      h.check(`${name} data-active-quote-status after gesture ${i + 1}`, false, "empty");
      continue;
    }
    const prev = sequence[sequence.length - 1];
    if (status === prev) {
      continue;
    }
    if (prev && ORDERED_STATUSES.indexOf(status) < ORDERED_STATUSES.indexOf(prev) && direction > 0) {
      h.check(`${name} no backward jump down`, false, `${prev} → ${status}`);
    }
    if (prev && ORDERED_STATUSES.indexOf(status) > ORDERED_STATUSES.indexOf(prev) && direction < 0) {
      h.check(`${name} no backward jump up`, false, `${prev} → ${status}`);
    }
    sequence.push(status);
  }

  assertMonotonicSequence(h, name, sequence, direction);
  return sequence;
}

async function assertSnapStopAlways(page, h) {
  const stops = await page.evaluate(() =>
    [...document.querySelectorAll(".landing-demo-beat-track")].map((el) =>
      getComputedStyle(el).scrollSnapStop,
    ),
  );
  h.check(
    "beat tracks scroll-snap-stop always",
    stops.length === 6 && stops.every((s) => s === "always"),
    stops.join(","),
  );
}

async function assertStepperFitsViewport(page, h, viewportWidth) {
  const layout = await page.evaluate(() => {
    const track = document.querySelector(".landing-workflow-request .quote-progress-track");
    if (!track) {
      return null;
    }
    return { scrollWidth: track.scrollWidth, innerWidth: track.clientWidth };
  });
  h.check(
    `${viewportWidth}: stepper track fits viewport`,
    layout !== null && layout.scrollWidth <= layout.innerWidth + 1,
    layout ? `${layout.scrollWidth}/${layout.innerWidth}` : "missing track",
  );
}

async function assertPageUpReachesHero(page, h, label) {
  let lastY = -1;
  let unchanged = 0;
  for (let i = 0; i < 28; i += 1) {
    await page.keyboard.press("PageUp");
    await waitScrubSettle(page, 2600);
    const y = await page.evaluate(() => window.scrollY);
    if (y <= 0) {
      h.check(`${label} PageUp reaches hero`, true, "scrollY=0");
      return;
    }
    if (Math.abs(y - lastY) < 1 && lastY >= 0) {
      unchanged += 1;
      if (unchanged >= 2) {
        h.check(`${label} PageUp reaches hero`, false, `stuck at scrollY=${y} after ${i + 1} presses`);
        return;
      }
    } else {
      unchanged = 0;
    }
    lastY = y;
  }
  const finalY = await page.evaluate(() => window.scrollY);
  h.check(`${label} PageUp reaches hero`, finalY <= 0, `scrollY=${finalY}`);
}

module.exports = {
  ORDERED_STATUSES,
  waitScrubSettle,
  readActiveQuoteStatus,
  touchSwipe,
  touchFling,
  realGestureBeatTour,
  assertMonotonicSequence,
  assertSnapStopAlways,
  assertStepperFitsViewport,
  assertPageUpReachesHero,
};
