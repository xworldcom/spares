/* eslint-disable @typescript-eslint/no-require-imports */
const path = require("node:path");
const round4 = require("../round4/harness.cjs");

round4.OUT = process.env.R4_OUT ?? "/cursor/stores/self/media/round4h";
const fs = require("node:fs");
fs.mkdirSync(round4.OUT, { recursive: true });

async function finishAndExit(run) {
  try {
    await round4.finish(run);
  } catch (error) {
    console.warn("harness finish:", error?.message ?? error);
  }
  const failed = round4.checks.some((c) => !c.ok);
  process.exitCode = failed ? 1 : 0;
  process.exit(process.exitCode);
}

module.exports = {
  h: round4,
  finishAndExit,
};
