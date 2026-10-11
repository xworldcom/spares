#!/usr/bin/env node
/**
 * Prod concurrent-load matrix (sequential, 4, 8, 12 parallel cells).
 * Wraps p0-fetch-abort-probe-matrix.mjs with default evidence paths.
 */
import { spawnSync } from "node:child_process";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

const evidenceDir = resolve(
  process.env.OEE360_EVIDENCE_DIR ||
    "/cursor/stores/self/media/staff-app/concurrent-load-perf-2026-10-11",
);

let gitSha = process.env.GIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || "";
if (!gitSha) {
  try {
    gitSha = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    gitSha = "";
  }
}

const result = spawnSync(
  process.execPath,
  [resolve("scripts/p0-fetch-abort-probe-matrix.mjs")],
  {
    env: {
      ...process.env,
      OEE360_EVIDENCE_DIR: evidenceDir,
      GIT_SHA: gitSha,
    },
    stdio: "inherit",
  },
);

process.exit(result.status ?? 1);
