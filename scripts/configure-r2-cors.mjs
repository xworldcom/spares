#!/usr/bin/env node
/**
 * Apply fail-closed CORS rules to the private Spares R2 models bucket.
 *
 * Requires S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY.
 * Optional: SPARES_CORS_ORIGINS (comma-separated extra origins).
 *
 * Usage:
 *   node scripts/configure-r2-cors.mjs
 *   node scripts/configure-r2-cors.mjs --dry-run
 *   node scripts/configure-r2-cors.mjs --add-origin=https://spares-git-main-xworldcom.vercel.app
 *
 * Vercel Preview hosts (spares-*.vercel.app) are allowed by app CORS but not on the
 * bucket by default. Small chat attachments use a same-origin proxy on Preview; for
 * large direct-to-R2 uploads from a Preview tab, add that deployment URL with
 * --add-origin (or SPARES_CORS_ORIGINS) then re-run this script.
 */

import { PutBucketCorsCommand, S3Client } from "@aws-sdk/client-s3";

const SOFT_LAUNCH_ORIGINS = [
  "https://spares-yonder3.vercel.app",
  "https://spares-liart.vercel.app",
  "https://oee360.com",
  "https://www.oee360.com",
];

const LOCAL_DEV_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

function parseArgs(argv) {
  const dryRun = argv.includes("--dry-run");
  const addOrigins = argv
    .filter((arg) => arg.startsWith("--add-origin="))
    .map((arg) => arg.slice("--add-origin=".length).trim())
    .filter(Boolean);
  return { dryRun, addOrigins };
}

function parseExtraOrigins() {
  const raw = process.env.SPARES_CORS_ORIGINS?.trim();
  if (!raw) {
    return [];
  }
  return raw
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

function collectOrigins(addOrigins) {
  const origins = new Set([
    ...SOFT_LAUNCH_ORIGINS,
    ...LOCAL_DEV_ORIGINS,
    ...parseExtraOrigins(),
    ...addOrigins,
  ]);
  return [...origins].sort();
}

function buildRules(origins) {
  return [
    {
      AllowedOrigins: origins,
      AllowedMethods: ["GET", "HEAD", "PUT"],
      AllowedHeaders: ["*"],
      ExposeHeaders: ["ETag", "Content-Length", "Content-Type"],
      MaxAgeSeconds: 3600,
    },
  ];
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function main() {
  const { dryRun, addOrigins } = parseArgs(process.argv.slice(2));
  const origins = collectOrigins(addOrigins);
  const rules = buildRules(origins);

  const payload = {
    bucket: process.env.S3_BUCKET?.trim() ?? "<S3_BUCKET>",
    origins,
    rules,
  };

  if (dryRun) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const client = new S3Client({
    endpoint: requireEnv("S3_ENDPOINT"),
    region: process.env.S3_REGION?.trim() || "auto",
    credentials: {
      accessKeyId: requireEnv("S3_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("S3_SECRET_ACCESS_KEY"),
    },
    forcePathStyle: true,
  });

  await client.send(
    new PutBucketCorsCommand({
      Bucket: requireEnv("S3_BUCKET"),
      CORSConfiguration: { CORSRules: rules },
    }),
  );

  console.log(
    `Applied R2 CORS policy to ${process.env.S3_BUCKET} for ${origins.length} origin(s).`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
