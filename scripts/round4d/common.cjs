/* eslint-disable @typescript-eslint/no-require-imports */
const path = require("node:path");
const round4 = require("../round4/harness.cjs");

round4.OUT = process.env.R4_OUT ?? "/cursor/stores/self/media/round4d";
const fs = require("node:fs");
fs.mkdirSync(round4.OUT, { recursive: true });

const TENANT = "tenant-oee360-host";
const HARDWARE_ID = "hardware-fixture";
const TRAY_KEY = `spares-quote-tray:${TENANT}:${HARDWARE_ID}`;
const HIDDEN_KEY = `spares-hidden-parts:${TENANT}:${HARDWARE_ID}`;

async function finishAndExit(run) {
  await round4.finish(run);
  process.exit(round4.checks.some((c) => !c.ok) ? 1 : 0);
}

module.exports = {
  h: round4,
  TENANT,
  HARDWARE_ID,
  TRAY_KEY,
  HIDDEN_KEY,
  finishAndExit,
};
