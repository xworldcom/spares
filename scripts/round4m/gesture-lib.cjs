/* eslint-disable @typescript-eslint/no-require-imports */
const round4l = require("../round4l/gesture-lib.cjs");
const { mediumTouchSwipe } = round4l;

async function sectionTitleInView(page, selector, viewportHeight, tolerance = 48) {
  return page.evaluate(
    ({ sel, vh, tol }) => {
      const el = document.querySelector(sel);
      if (!el) {
        return { ok: false, reason: "missing" };
      }
      const box = el.getBoundingClientRect();
      const title = el.querySelector("h2") ?? el;
      const tbox = title.getBoundingClientRect();
      const inView = tbox.bottom > 0 && tbox.top < vh;
      return { ok: inView, top: Math.round(tbox.top) };
    },
    { sel: selector, vh: viewportHeight, tol: tolerance },
  );
}

async function assertPostHandoffStops(page, h, viewportHeight) {
  const schematicSel = "#machine-model";
  const assemblySel = "#cad-ingest";
  let schematic = await sectionTitleInView(page, schematicSel, viewportHeight);
  if (!schematic.ok) {
    const yAtConfirmed = await page.evaluate(() => window.scrollY);
    await page.keyboard.press("PageDown");
    await round4l.waitScrubSettle(page, 2800);
    const y1 = await page.evaluate(() => window.scrollY);
    schematic = await sectionTitleInView(page, schematicSel, viewportHeight);
    h.check(
      "one PageDown past Confirmed reaches schematic stop",
      schematic.ok && y1 > yAtConfirmed + 40,
      JSON.stringify({ schematic, y0: yAtConfirmed, y1 }),
    );
  }

  await page.keyboard.press("PageDown");
  await round4l.waitScrubSettle(page, 2800);
  const assembly = await sectionTitleInView(page, assemblySel, viewportHeight);
  h.check("PageDown reaches assembly stop", assembly.ok, JSON.stringify(assembly));

  await page.keyboard.press("PageDown");
  await round4l.waitScrubSettle(page, 2800);
  const footer = await page.locator(".landing-site-footer-link").boundingBox();
  h.check(
    "PageDown reaches footer",
    Boolean(footer && footer.y >= 0 && footer.y + footer.height <= viewportHeight + 6),
    JSON.stringify(footer),
  );

  await page.keyboard.press("PageUp");
  await round4l.waitScrubSettle(page, 2800);
  const assemblyUp = await sectionTitleInView(page, assemblySel, viewportHeight);
  h.check("PageUp from footer lands on assembly", assemblyUp.ok, JSON.stringify(assemblyUp));

  await page.keyboard.press("PageUp");
  await round4l.waitScrubSettle(page, 2800);
  for (let i = 0; i < 4; i += 1) {
    await page.keyboard.press("PageUp");
    await round4l.waitScrubSettle(page, 2600);
    const status = await round4l.readActiveQuoteStatus(page);
    if (status === "confirmed") {
      h.check("PageUp returns to Confirmed chapter from post-footer", true, status);
      return;
    }
  }
  const status = await round4l.readActiveQuoteStatus(page);
  h.check("PageUp returns to Confirmed chapter from post-footer", status === "confirmed", status);
}

async function assertWheelCannotSkipBeats(page, h, viewportHeight) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await round4l.waitScrubSettle(page, 2000);
  for (let i = 0; i < 40; i += 1) {
    const status = await round4l.readActiveQuoteStatus(page);
    if (status === "requested") {
      break;
    }
    await page.keyboard.press("PageDown");
    await round4l.waitScrubSettle(page, 1800);
  }
  const start = await round4l.readActiveQuoteStatus(page);
  h.check("wheel cap tour starts on Requested", start === "requested", start);
  const trackHeight = await page.evaluate(() => {
    const track = document.querySelector(".landing-demo-beat-track");
    return track?.offsetHeight ?? 420;
  });
  const delta = Math.max(12, Math.round(trackHeight / 15));
  const before = await round4l.readActiveQuoteStatus(page);
  for (let n = 0; n < 15; n += 1) {
    await page.mouse.wheel(0, delta);
    await page.waitForTimeout(100);
  }
  await round4l.waitScrubSettle(page, 2400);
  const after = await round4l.readActiveQuoteStatus(page);
  const order = round4l.ORDERED_STATUSES;
  const skipped = order.indexOf(after) - order.indexOf(before);
  h.check(
    "15 wheel notches advance at most one beat from Requested",
    skipped <= 1,
    `${before} → ${after} (Δindex=${skipped})`,
  );
}

/** PageUp only — no scrollTo(0) fallback (real keyboard path must reach hero). */
async function assertPageUpReachesHero(page, h, label) {
  let lastY = -1;
  let unchanged = 0;
  for (let i = 0; i < 48; i += 1) {
    await page.keyboard.press("PageUp");
    await round4l.waitScrubSettle(page, 2600);
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

async function assertSwipeDirectionGuard(page, viewport, direction, h, label) {
  const startY = await page.evaluate(() => window.scrollY);
  await mediumTouchSwipe(page, viewport, direction, null, label);
  await round4l.waitScrubSettle(page, 3200);
  const endY = await page.evaluate(() => window.scrollY);
  if (direction > 0) {
    h.check(
      `${label}: swipe down does not end above start`,
      endY >= startY - 10,
      `${startY} → ${endY}`,
    );
  } else {
    h.check(
      `${label}: swipe up does not end below start`,
      endY <= startY + 10,
      `${startY} → ${endY}`,
    );
  }
  return { startY, endY };
}

module.exports = {
  ...round4l,
  sectionTitleInView,
  assertPostHandoffStops,
  assertWheelCannotSkipBeats,
  assertSwipeDirectionGuard,
  assertPageUpReachesHero,
};
