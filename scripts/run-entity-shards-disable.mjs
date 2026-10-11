#!/usr/bin/env node
/**
 * Instant rollback: clear entityShardsV1 / catalogHealDeferredV1 on catalog (catalog remains SoT).
 */
import { spawnSync } from "node:child_process";

if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
  console.error("BLOB_READ_WRITE_TOKEN is required.");
  process.exit(2);
}

const code = `
  import { readDatabase, writeDatabase } from "./src/lib/store.ts";
  const db = await readDatabase();
  const next = {
    ...db,
    dataMigrations: {
      ...db.dataMigrations,
      entityShardsV1: 0,
      catalogHealDeferredV1: 0,
    },
  };
  await writeDatabase(next);
  console.log(JSON.stringify({
    ok: true,
    dataMigrations: next.dataMigrations,
    at: new Date().toISOString(),
  }));
`;

const result = spawnSync(
  "node",
  ["--experimental-strip-types", "--input-type=module", "-e", code],
  { cwd: process.cwd(), encoding: "utf8", env: process.env },
);
if (result.stdout) {
  process.stdout.write(result.stdout);
}
if (result.stderr) {
  process.stderr.write(result.stderr);
}
process.exit(result.status ?? 1);
