/* eslint-disable @typescript-eslint/no-require-imports */
const h = require("../round4/harness.cjs");

const TENANT = "tenant-oee360-host";
const HARDWARE_ID = "hardware-fixture";
const TRAY_KEY = `spares-quote-tray:${TENANT}:${HARDWARE_ID}`;
const HIDDEN_KEY = `spares-hidden-parts:${TENANT}:${HARDWARE_ID}`;

/** Seed localStorage on the machine origin, then reload so the app restores it (Bea's path). */
async function restoreTrayFromStorage(page, lines) {
  await page.goto(`${h.BASE}/machines/${HARDWARE_ID}`, { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ([key, value]) => localStorage.setItem(key, JSON.stringify(value)),
    [TRAY_KEY, lines],
  );
  await page.reload({ waitUntil: "domcontentloaded" });
}

async function finishAndExit(run) {
  await h.finish(run);
  process.exit(h.checks.some((c) => !c.ok) ? 1 : 0);
}

module.exports = { h, TENANT, HARDWARE_ID, TRAY_KEY, HIDDEN_KEY, restoreTrayFromStorage, finishAndExit };
