#!/usr/bin/env node
/**
 * rv421 Mac proof — copy read-only prod demo catalog into a disposable SPARES_DATA_DIR.
 *
 *   node scripts/rv421-mac-proof-seed.mjs
 *
 * Env:
 *   RV421_PROOF_DATA_DIR — target dir (default /tmp/oee360-rv421-proof-<stamp>)
 *   BLOB_READ_WRITE_TOKEN — preferred: pulls spares/db.json + care.json from Vercel Blob
 *   OEE360_PROD_SNAPSHOT_DIR — fallback: copy db.json, care.json, activity.json (+ optional files/) from tree
 *   OEE360_BASE_URL — default https://oee360.com (tenant guard only; no writes)
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HARDWARE_FIXTURE_ID = "hardware-fixture";
const DEFAULT_HW_STORED = "hardware-fixture.glb";
const HW_PLACEHOLDER_REL = join("public", "placeholders", "hardware", "mcmaster-hardware.glb");

function repoRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..");
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = resolve(
  process.env.RV421_PROOF_DATA_DIR ||
    join("/tmp", `oee360-rv421-proof-${stamp}`),
);
const prodBase = (process.env.OEE360_BASE_URL || "https://oee360.com").replace(/\/$/, "");

mkdirSync(join(outDir, "files"), { recursive: true });

function copyCatalogFile(srcRoot, srcName, destName) {
  const src = join(srcRoot, srcName);
  if (!existsSync(src)) {
    return false;
  }
  cpSync(src, join(outDir, destName));
  return true;
}

function copyFromSnapshot(srcRoot) {
  const catalogFiles = [
    { src: "db.json", dest: "db.json" },
    { src: "database.json", dest: "db.json" },
    { src: "care.json", dest: "care.json" },
    { src: "activity.json", dest: "activity.json" },
    { src: "platform-settings.json", dest: "platform-settings.json" },
  ];
  for (const { src, dest } of catalogFiles) {
    copyCatalogFile(srcRoot, src, dest);
  }
  const shards = join(srcRoot, "entity-shards");
  if (existsSync(shards)) {
    cpSync(shards, join(outDir, "entity-shards"), { recursive: true });
  }
  const filesDir = join(srcRoot, "files");
  if (existsSync(filesDir)) {
    cpSync(filesDir, join(outDir, "files"), { recursive: true });
  }
}

function storedFileNameForHardwareFixture(dataDir) {
  try {
    const db = JSON.parse(readFileSync(join(dataDir, "db.json"), "utf8"));
    const machines = Array.isArray(db.machines) ? db.machines : [];
    const row = machines.find((m) => m?.id === HARDWARE_FIXTURE_ID);
    const name = typeof row?.storedFileName === "string" ? row.storedFileName.trim() : "";
    return name || DEFAULT_HW_STORED;
  } catch {
    return DEFAULT_HW_STORED;
  }
}

/**
 * Prod / blob snapshots ship catalog JSON only. Mac gate needs local model bytes so
 * GET /api/machines/hardware-fixture/file returns 200 and the viewer can flip
 * data-viewer-canonical-ready.
 */
function ensureProofHardwareFixtureModel(dataDir) {
  const stored = storedFileNameForHardwareFixture(dataDir);
  const dest = join(dataDir, "files", stored);
  if (existsSync(dest) && statSync(dest).size > 0) {
    return { stored, copied: false, dest };
  }
  mkdirSync(join(dataDir, "files"), { recursive: true });
  const placeholder = join(repoRoot(), HW_PLACEHOLDER_REL);
  if (!existsSync(placeholder)) {
    throw new Error(`rv421 seed: missing placeholder GLB at ${placeholder}`);
  }
  cpSync(placeholder, dest);
  return { stored, copied: true, dest, from: placeholder };
}

/** Idempotent heals so Mac proof matches live demo expectations (no prod writes). */
function healProofCatalog(dir) {
  const dbPath = join(dir, "db.json");
  const db = JSON.parse(readFileSync(dbPath, "utf8"));
  let touched = false;
  const quotes = Array.isArray(db.quotes) ? [...db.quotes] : [];
  const q27 = quotes.findIndex((row) => row?.number === 27);
  if (q27 >= 0) {
    const row = { ...quotes[q27] };
    const poStage = ["po_received", "confirmed", "ordered", "shipped", "delivered"].includes(
      row.status,
    );
    if (!poStage && row.status !== "closed" && row.status !== "cancelled") {
      row.status = "po_received";
      touched = true;
    }
    if (row.staffPricingUnlocked) {
      row.staffPricingUnlocked = false;
      touched = true;
    }
    if (touched) {
      quotes[q27] = row;
      db.quotes = quotes;
    }
  }
  if (db.dataMigrations?.demoRv421Quote27V1 !== 2) {
    db.dataMigrations = { ...(db.dataMigrations ?? {}), demoRv421Quote27V1: 2 };
    touched = true;
  }
  if (touched) {
    writeFileSync(dbPath, `${JSON.stringify(db, null, 2)}\n`);
  }
}

async function assertDemoTenantReadOnly() {
  const res = await fetch(`${prodBase}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: process.env.OEE360_STAFF_EMAIL || "staff@demo.com",
      password: process.env.OEE360_STAFF_PASSWORD || "demo123456",
    }),
  });
  if (!res.ok) {
    throw new Error(`prod login failed ${res.status}`);
  }
  const jar = (res.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(";")[0])
    .join("; ");
  const me = await fetch(`${prodBase}/api/auth/me`, {
    headers: { cookie: jar },
  }).then((r) => r.json());
  if (me.user?.tenantId !== "tenant-oee360-host") {
    throw new Error(`refusing non-demo tenant ${me.user?.tenantId}`);
  }
  return { jar, me };
}

async function pullViaBlob() {
  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    return false;
  }
  const result = spawnSync(
    "node",
    ["scripts/blob-catalog-snapshot.mjs"],
    {
      env: {
        ...process.env,
        OEE360_BACKUP_DIR: join(outDir, "_blob-pull"),
        OEE360_BACKUP_STAMP: stamp,
      },
      stdio: "inherit",
      cwd: process.cwd(),
    },
  );
  if (result.status !== 0) {
    throw new Error("blob-catalog-snapshot failed");
  }
  const pulled = join(outDir, "_blob-pull", stamp);
  copyFromSnapshot(pulled);
  if (!existsSync(join(outDir, "db.json")) && existsSync(join(pulled, "database.json"))) {
    copyCatalogFile(pulled, "database.json", "db.json");
  }
  return existsSync(join(outDir, "db.json"));
}

async function main() {
  await assertDemoTenantReadOnly();

  let source = "blob";
  if (!(await pullViaBlob())) {
    const snap = process.env.OEE360_PROD_SNAPSHOT_DIR?.trim();
    const snapRoot = snap ? resolve(snap) : "";
    const snapHasCatalog =
      snapRoot &&
      (existsSync(join(snapRoot, "db.json")) ||
        existsSync(join(snapRoot, "database.json")));
    if (!snapHasCatalog) {
      console.error(
        "Need BLOB_READ_WRITE_TOKEN or OEE360_PROD_SNAPSHOT_DIR with db.json (or database.json) for prod-identical seed.",
      );
      process.exit(1);
    }
    source = "snapshot";
    copyFromSnapshot(snapRoot);
  }

  if (!existsSync(join(outDir, "db.json"))) {
    throw new Error(`seed incomplete: missing db.json in ${outDir}`);
  }

  healProofCatalog(outDir);

  const hardwareFixtureModel = ensureProofHardwareFixtureModel(outDir);

  const meta = {
    ok: true,
    outDir,
    source,
    prodBase,
    readOnly: true,
    hardwareFixtureModel,
    stampedAt: new Date().toISOString(),
  };
  writeFileSync(join(outDir, "rv421-seed-meta.json"), JSON.stringify(meta, null, 2));
  console.log(JSON.stringify(meta, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
