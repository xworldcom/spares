#!/usr/bin/env node
/**
 * Download prod catalog JSON from Vercel Blob (private).
 * Requires BLOB_READ_WRITE_TOKEN from Vercel project env only.
 *
 * Model blobs (e.g. files/hardware-fixture.glb) are not in this pull; Mac proof seed
 * copies them from repo placeholders or from OEE360_PROD_SNAPSHOT_DIR/files/ when present.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { get, list, put } from "@vercel/blob";

const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
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

const blobOpts = { access: "private", token };

async function pullOne(key, pathname) {
  const result = await get(pathname, blobOpts);
  if (!result || result.statusCode !== 200 || !result.stream) {
    throw new Error(`Missing or unreadable blob: ${pathname} (${result?.statusCode})`);
  }
  const json = Buffer.from(await new Response(result.stream).arrayBuffer()).toString("utf8");
  writeFileSync(join(outDir, key + ".json"), json);
  const parsed = JSON.parse(json);
  return { bytes: json.length, keys: Object.keys(parsed) };
}

async function pullShards() {
  const prefix = `spares/${ns}records/`;
  const shardDir = join(outDir, "entity-shards");
  mkdirSync(shardDir, { recursive: true });
  const collected = [];
  let cursor;
  do {
    const page = await list({ prefix, cursor, token });
    for (const blob of page.blobs) {
      const rel = blob.pathname.replace(prefix, "").replace(/\//g, "__");
      const result = await get(blob.pathname, blobOpts);
      if (!result?.stream) {
        continue;
      }
      const json = Buffer.from(await new Response(result.stream).arrayBuffer()).toString("utf8");
      writeFileSync(join(shardDir, rel), json);
      collected.push({ pathname: blob.pathname, bytes: json.length });
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return collected;
}

async function verifyRestoreToPreviewPrefix(manifest) {
  const verifyPrefix = `spares/${ns}gate-backups/${stamp}/`;
  const restored = [];
  for (const [key, meta] of Object.entries(manifest.files)) {
    if (!meta.pathname || meta.skipped) {
      continue;
    }
    const localPath = join(outDir, key + ".json");
    const body = await import("node:fs").then((fs) => fs.readFileSync(localPath));
    const target = `${verifyPrefix}${key}.json`;
    await put(target, body, { access: "private", token, addRandomSuffix: false });
    const round = await get(target, blobOpts);
    const roundBody = Buffer.from(await new Response(round.stream).arrayBuffer());
    restored.push({
      target,
      bytes: roundBody.length,
      matches: roundBody.length === body.length,
    });
  }
  return { verifyPrefix, restored };
}

async function main() {
  if (!token) {
    console.error("BLOB_READ_WRITE_TOKEN is required (Vercel project env / vercel env pull).");
    process.exit(2);
  }
  const manifest = {
    at: new Date().toISOString(),
    stamp,
    outDir,
    paths,
    files: {},
    entityShards: [],
    restoreVerify: null,
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
  manifest.entityShards = await pullShards();
  manifest.restoreVerify = await verifyRestoreToPreviewPrefix(manifest);
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
