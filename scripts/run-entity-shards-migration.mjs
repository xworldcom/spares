#!/usr/bin/env node
/**
 * One-off: dual-write tenant rows to entity shards and set entityShardsV1 on catalog.
 * Requires BLOB_READ_WRITE_TOKEN (prod/preview catalog). Env: SPARES_TENANT_ID (default tenant-oee360-host).
 */
import { spawnSync } from "node:child_process";

const tenantId = process.env.SPARES_TENANT_ID?.trim() || "tenant-oee360-host";
if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
  console.error("BLOB_READ_WRITE_TOKEN is required.");
  process.exit(2);
}

const code = `
  import { runEntityShardsMigration } from "./src/lib/store.ts";
  const result = await runEntityShardsMigration(${JSON.stringify(tenantId)});
  console.log(JSON.stringify({ ok: true, tenantId: ${JSON.stringify(tenantId)}, result, at: new Date().toISOString() }));
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
