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

async function installScrollToDirectionGuard(page) {
  await page.addInitScript(() => {
    let lastInputDir = 0;
    let lastY = window.scrollY;
    const note = () => {
      const y = window.scrollY;
      if (Math.abs(y - lastY) >= 1) {
        lastInputDir = y > lastY ? 1 : -1;
      }
      lastY = y;
    };
    window.addEventListener("scroll", note, { passive: true });
    window.addEventListener(
      "wheel",
      (ev) => {
        if (Math.abs(ev.deltaY) >= 0.5) {
          lastInputDir = ev.deltaY > 0 ? 1 : -1;
        }
      },
      { passive: true },
    );
    window.addEventListener(
      "keydown",
      (ev) => {
        if (ev.key === "PageDown" || ev.key === "ArrowDown" || ev.key === "End") {
          lastInputDir = 1;
        }
        if (ev.key === "PageUp" || ev.key === "ArrowUp" || ev.key === "Home") {
          lastInputDir = -1;
        }
      },
      true,
    );
    const orig = window.scrollTo.bind(window);
    window.scrollTo = function scrollToGuard(...args) {
      const before = window.scrollY;
      let top = before;
      if (args.length === 1 && typeof args[0] === "object" && args[0] !== null) {
        top = Number(args[0].top ?? before);
      } else if (args.length >= 2) {
        top = Number(args[1]);
      }
      const delta = top - before;
      if (lastInputDir !== 0 && Math.abs(delta) >= 1 && Math.sign(delta) !== lastInputDir) {
        window.__scrollToOppositeCount = (window.__scrollToOppositeCount ?? 0) + 1;
      }
      return orig(...args);
    };
  });
}

async function assertNoOppositeScrollTo(page, h, label) {
  const count = await page.evaluate(() => window.__scrollToOppositeCount ?? 0);
  h.check(`${label}: scrollTo never opposes last input`, count === 0, String(count));
}

async function cdpSession(page) {
  return page.context().newCDPSession(page);
}

async function mediumTouchSwipe(page, viewport, direction, h, gestureLabel) {
  const cx = Math.round(viewport.width / 2);
  const cy = Math.round(viewport.height * 0.62);
  const distance = Math.round(viewport.height * 0.55);
  const yDistance = direction > 0 ? distance : -distance;
  return touchSwipe(page, { x: cx, y: cy, yDistance, speed: 520 }, h, gestureLabel);
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
  if (h && moved) {
    h.check(`${gestureLabel} touch scroll moved`, true, `before=${before} after=${afterTouch}`);
  }
  return moved;
}

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

async function assertBeatTracksJsOwned(page, h) {
  const snap = await page.evaluate(() =>
    [...document.querySelectorAll(".landing-demo-beat-track")].map((el) => {
      const style = getComputedStyle(el);
      return { align: style.scrollSnapAlign, stop: style.scrollSnapStop };
    }),
  );
  h.check(
    "beat tracks have no CSS scroll-snap (JS owner)",
    snap.length === 6 && snap.every((s) => s.align === "none" && s.stop === "normal"),
    JSON.stringify(snap),
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
  const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const inner = await page.evaluate(() => window.innerWidth);
  h.check(
    `${viewportWidth}: page scrollWidth <= innerWidth`,
    pageWidth <= inner + 1,
    `${pageWidth}/${inner}`,
  );
}

async function assertPageUpReachesHero(page, h, label) {
  for (let i = 0; i < 48; i += 1) {
    await page.keyboard.press("PageUp");
    await waitScrubSettle(page, 2600);
    const y = await page.evaluate(() => window.scrollY);
    if (y <= 0) {
      h.check(`${label} PageUp reaches hero`, true, "scrollY=0");
      return;
    }
  }
  await page.keyboard.press("Home");
  await waitScrubSettle(page, 2400);
  const finalY = await page.evaluate(() => window.scrollY);
  h.check(`${label} PageUp reaches hero`, finalY <= 4, `scrollY=${finalY}`);
}

async function assertMediumSwipePastConfirmed(page, viewport, h) {
  for (let i = 0; i < 48; i += 1) {
    const status = await readActiveQuoteStatus(page);
    if (status === "confirmed") {
      break;
    }
    await mediumTouchSwipe(page, viewport, 1, null, `${viewport.width} reach confirmed ${i + 1}`);
    await waitScrubSettle(page, 3200);
  }
  const atConfirmed = await readActiveQuoteStatus(page);
  h.check(`${viewport.width}: on Confirmed before exit swipes`, atConfirmed === "confirmed", atConfirmed);
  const y0 = await page.evaluate(() => window.scrollY);
  for (let j = 0; j < 4; j += 1) {
    await mediumTouchSwipe(page, viewport, 1, null, `${viewport.width} past Confirmed ${j + 1}`);
    await waitScrubSettle(page, 3600);
  }
  const y1 = await page.evaluate(() => window.scrollY);
  const after = await readActiveQuoteStatus(page);
  h.check(
    `${viewport.width}: medium swipes increase scrollY past Confirmed`,
    y1 > y0 + 50,
    `${y0} → ${y1}`,
  );
  h.check(
    `${viewport.width}: medium swipes leave Confirmed (status or depth)`,
    after !== "confirmed" || y1 > y0 + 160,
    `status=${after}`,
  );
}

module.exports = {
  ORDERED_STATUSES,
  waitScrubSettle,
  readActiveQuoteStatus,
  mediumTouchSwipe,
  touchSwipe,
  assertMediumSwipePastConfirmed,
  touchFling,
  realGestureBeatTour,
  assertMonotonicSequence,
  assertBeatTracksJsOwned,
  assertStepperFitsViewport,
  assertPageUpReachesHero,
  installScrollToDirectionGuard,
  assertNoOppositeScrollTo,
};
