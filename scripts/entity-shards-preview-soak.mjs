#!/usr/bin/env node
/**
 * ~10min concurrent probe soak. Env: OEE360_BASE_URL, OEE360_EVIDENCE_DIR, SOAK_MINUTES (default 10).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";

const baseUrl = process.env.OEE360_BASE_URL || "https://spares-git-main-yonder3.vercel.app";
const outDir = resolve(
  process.env.OEE360_EVIDENCE_DIR ||
    "/cursor/stores/self/media/staff-app/entity-shards-v1/preview-soak",
);
const minutes = Number(process.env.SOAK_MINUTES || 10);
const intervalSec = Number(process.env.SOAK_INTERVAL_SEC || 60);
mkdirSync(outDir, { recursive: true });

const runs = [];
const endAt = Date.now() + minutes * 60_000;
let i = 0;
while (Date.now() < endAt) {
  i += 1;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const probeOut = join(outDir, `probe-${stamp}.json`);
  const r = spawnSync(
    "node",
    ["scripts/concurrency-gate-probe.mjs"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        OEE360_BASE_URL: baseUrl,
        OEE360_EVIDENCE_DIR: outDir,
      },
    },
  );
  let parsed = { ok: false, parseError: true };
  try {
    parsed = JSON.parse(r.stdout || "{}");
  } catch {
    parsed = { ok: false, stdout: r.stdout?.slice(0, 500), stderr: r.stderr?.slice(0, 500) };
  }
  runs.push({
    i,
    at: new Date().toISOString(),
    exitCode: r.status,
    ok: parsed.ok === true,
    scenarios: parsed.scenarios,
    status5xx: r.status > 1,
  });
  writeFileSync(join(outDir, "soak-log.json"), JSON.stringify({ baseUrl, minutes, runs }, null, 2));
  if (Date.now() >= endAt) {
    break;
  }
  await new Promise((resolveWait) => setTimeout(resolveWait, intervalSec * 1000));
}

const summary = {
  baseUrl,
  minutes,
  runCount: runs.length,
  allOk: runs.every((row) => row.ok),
  any5xx: runs.some((row) => row.status5xx),
  runs,
};
writeFileSync(join(outDir, "soak-summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
process.exit(summary.allOk ? 0 : 1);
