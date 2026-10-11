#!/usr/bin/env node
/**
 * Download prod catalog JSON from Vercel Blob (private).
 * Requires BLOB_READ_WRITE_TOKEN. Optional SPARES_BLOB_NAMESPACE.
 *
 * Env: BLOB_READ_WRITE_TOKEN, OEE360_BACKUP_DIR (default: ./backups)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { get } from "@vercel/blob";

const ns = process.env.SPARES_BLOB_NAMESPACE?.trim()
  ? `${process.env.SPARES_BLOB_NAMESPACE.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "")}/`
  : "";

const paths = {
  database: `spares/${ns}db.json`,
  care: `spares/${ns}care.json`,
  activity: `spares/${ns}activity.json`,
  platformSettings: `spares/${ns}platform-settings.json`,
};

const stamp =
  process.env.OEE360_BACKUP_STAMP ||
  new Date().toISOString().replace(/[:.]/g, "-");
const outRoot = resolve(
  process.env.OEE360_BACKUP_DIR ||
    "/cursor/stores/self/media/staff-app/concurrency-migration/backups",
);
const outDir = join(outRoot, stamp);
mkdirSync(outDir, { recursive: true });

async function pullOne(key, pathname) {
  const result = await get(pathname, { access: "private", token: process.env.BLOB_READ_WRITE_TOKEN });
  if (!result || result.statusCode !== 200 || !result.stream) {
    throw new Error(`Missing or unreadable blob: ${pathname} (${result?.statusCode})`);
  }
  const json = Buffer.from(await new Response(result.stream).arrayBuffer()).toString("utf8");
  writeFileSync(join(outDir, key + ".json"), json);
  const parsed = JSON.parse(json);
  return { bytes: json.length, keys: Object.keys(parsed) };
}

async function main() {
  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    console.error("BLOB_READ_WRITE_TOKEN is required for blob snapshot.");
    process.exit(2);
  }
  const manifest = {
    at: new Date().toISOString(),
    stamp,
    outDir,
    paths,
    files: {},
  };
  for (const [key, pathname] of Object.entries(paths)) {
    try {
      manifest.files[key] = { pathname, ...(await pullOne(key, pathname)) };
    } catch (cause) {
      if (key === "activity" || key === "platformSettings") {
        manifest.files[key] = { pathname, skipped: String(cause) };
        continue;
      }
      throw cause;
    }
  }
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
