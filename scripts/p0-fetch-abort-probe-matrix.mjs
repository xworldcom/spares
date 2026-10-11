#!/usr/bin/env node
/**
 * Run sequential, parallel-4, parallel-8, and parallel-12 prod matrix probes.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const baseOut = resolve(
  process.env.OEE360_EVIDENCE_DIR ||
    "/cursor/stores/self/media/staff-app/p0-fetch-abort-2026-10-11",
);
const modes = ["sequential", "parallel-4", "parallel-8", "parallel-12"];
const gitSha = process.env.GIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || null;
const rollup = [];

for (const mode of modes) {
  const outDir = resolve(baseOut, `prod-${mode}`);
  mkdirSync(outDir, { recursive: true });
  const result = spawnSync(
    process.execPath,
    [resolve("scripts/p0-fetch-abort-probe.mjs")],
    {
      env: {
        ...process.env,
        OEE360_EVIDENCE_DIR: outDir,
        P0_MATRIX_MODE: mode,
        GIT_SHA: gitSha ?? "",
      },
      stdio: "inherit",
    },
  );
  let summary = null;
  try {
    summary = JSON.parse(
      readFileSync(resolve(outDir, "summary.json"), "utf8"),
    );
  } catch {
    summary = null;
  }
  rollup.push({
    mode,
    exitCode: result.status ?? 1,
    outDir,
    coldTtvMedianMs: summary?.coldTtvMedianMs ?? null,
    coldTtvP95Ms: summary?.coldTtvP95Ms ?? null,
    coldTtvMaxMs: summary?.coldTtvMaxMs ?? null,
    coldOverGate: summary?.coldOverGate ?? null,
    coldRouteTtv: summary?.coldRouteTtv ?? null,
    http5xx: summary?.http5xx?.length ?? null,
  });
}

writeFileSync(
  resolve(baseOut, "matrix-rollup.json"),
  JSON.stringify({ gitSha, modes: rollup }, null, 2),
);
const failed = rollup.some((row) => row.exitCode !== 0);
process.exit(failed ? 1 : 0);
