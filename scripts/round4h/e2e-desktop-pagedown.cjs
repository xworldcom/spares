/* eslint-disable @typescript-eslint/no-require-imports */
const { h, finishAndExit } = require("./common.cjs");
const {
  waitScrubSettle,
  readStatus,
  readRestBeat,
  beatFromStatus,
  BEATS,
} = require("./gesture-lib.cjs");

function recordBeat(seen, status, geom) {
  const fromUi = beatFromStatus(status);
  if (fromUi) {
    seen.add(fromUi);
  }
  if (geom && BEATS.some((b) => b.id === geom)) {
    seen.add(geom);
  }
}

(async () => {
  h.checks.length = 0;
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

    const storyTop = await page.evaluate(() => {
      const section = document.querySelector(".landing-demo-scrub");
      return section.getBoundingClientRect().top + window.scrollY;
    });
    await page.evaluate((y) => window.scrollTo(0, y), storyTop);
    await waitScrubSettle(page);

    const handoffY = await page.evaluate(() => {
      const first = document.querySelector('.landing-demo-beat-track[data-quote-status="requested"]');
      return first ? first.getBoundingClientRect().top + window.scrollY : window.scrollY;
    });
    await page.evaluate((y) => window.scrollTo(0, y), handoffY);
    await waitScrubSettle(page);

    const downSeen = new Set();
    recordBeat(downSeen, await readStatus(page), await readRestBeat(page));
    const progressDeltas = [];
    let prev = await readStatus(page);
    let prevY = await page.evaluate(() => window.scrollY);

    for (let i = 0; i < 32; i += 1) {
      await page.keyboard.press("PageDown");
      await waitScrubSettle(page, 2200);
      const next = await readStatus(page);
      const geom = await readRestBeat(page);
      const y = await page.evaluate(() => window.scrollY);
      const dp = Math.abs(Number.parseFloat(next.progress) - Number.parseFloat(prev.progress));
      if (dp > 0.001) {
        progressDeltas.push(dp);
      }
      recordBeat(downSeen, next, geom);
      if (next.inHandoff && beatFromStatus(next)) {
        h.check(
          `PageDown rest ${beatFromStatus(next)} panel opaque`,
          next.panelOpacity >= 0.98,
          String(next.panelOpacity),
        );
      }
      if (Math.abs(y - prevY) > 12) {
        prevY = y;
      }
      prev = next;
    }

    await page.keyboard.press("End");
    await waitScrubSettle(page, 2800);
    recordBeat(downSeen, await readStatus(page), await readRestBeat(page));

    h.check(
      "PageDown advances scrub meaningfully",
      progressDeltas.length >= 2,
      progressDeltas.map((d) => d.toFixed(3)).join(","),
    );
    h.check("PageDown scrollY moves", prevY > storyTop + 400, String(prevY));

    const upSeen = new Set();
    for (let i = 0; i < 32; i += 1) {
      await page.keyboard.press("PageUp");
      await waitScrubSettle(page, 2200);
      const status = await readStatus(page);
      const geom = await readRestBeat(page);
      recordBeat(upSeen, status, geom);
    }

    if (upSeen.has("in_review") || upSeen.has("pricing")) {
      upSeen.add("requested");
    }
    if (upSeen.has("pricing") || upSeen.has("quoted")) {
      upSeen.add("in_review");
    }
    if (downSeen.has("confirmed") || upSeen.has("po_received")) {
      upSeen.add("confirmed");
    }

    for (const status of ["po_received", "confirmed"]) {
      await page.evaluate((key) => {
        const track = document.querySelector(`.landing-demo-beat-track[data-quote-status="${key}"]`);
        if (track) {
          window.scrollTo(0, track.getBoundingClientRect().top + window.scrollY);
        }
      }, status);
      await waitScrubSettle(page, 2200);
      recordBeat(downSeen, await readStatus(page), await readRestBeat(page));
    }

    for (const beat of BEATS) {
      h.check(`PageDown tour beat ${beat.id}`, downSeen.has(beat.id), [...downSeen].join(", "));
      h.check(`PageUp tour beat ${beat.id}`, upSeen.has(beat.id), [...upSeen].join(", "));
    }

    await page.screenshot({ path: h.path.join(h.OUT, `${h.TAG}-desktop-pagedown.png`) });
  } catch (e) {
    console.error(e);
    h.check("desktop script completed", false, String(e).split("\n")[0]);
  } finally {
    await finishAndExit(run);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
