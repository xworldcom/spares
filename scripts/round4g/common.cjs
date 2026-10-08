/* eslint-disable @typescript-eslint/no-require-imports */
const path = require("node:path");
const round4 = require("../round4/harness.cjs");

round4.OUT = process.env.R4_OUT ?? "/cursor/stores/self/media/round4g";
const fs = require("node:fs");
fs.mkdirSync(round4.OUT, { recursive: true });

async function finishAndExit(run) {
  await round4.finish(run);
  const failed = round4.checks.some((c) => !c.ok);
  process.exitCode = failed ? 1 : 0;
  process.exit(process.exitCode);
}

module.exports = {
  h: round4,
  finishAndExit,
};
