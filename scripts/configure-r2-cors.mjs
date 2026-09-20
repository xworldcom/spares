#!/usr/bin/env node
/**
 * Apply CORS so browsers can use short-lived signed R2 URLs for models,
 * manuals, and chat attachments without streaming those bytes through Vercel.
 *
 * Requires S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY.
 *
 * The bucket stays private. AllowedOrigins is `*` because a signed URL is the
 * capability; the app still fail-closes who can mint one. Preview hosts
 * (`spares-*.vercel.app`) therefore load GLBs from R2 instead of the
 * credentialed `/file` proxy.
 *
 * Usage:
 *   node scripts/configure-r2-cors.mjs
 *   node scripts/configure-r2-cors.mjs --dry-run
 */

import { PutBucketCorsCommand, S3Client } from "@aws-sdk/client-s3";

const RULES = [
  {
    AllowedOrigins: ["*"],
    AllowedMethods: ["GET", "HEAD", "PUT"],
    AllowedHeaders: ["*"],
    ExposeHeaders: ["ETag", "Content-Length", "Content-Type"],
    MaxAgeSeconds: 3600,
  },
];

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const payload = {
    bucket: process.env.S3_BUCKET?.trim() ?? "<S3_BUCKET>",
    rules: RULES,
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
      CORSConfiguration: { CORSRules: RULES },
    }),
  );

  console.log(
    `Applied R2 CORS policy to ${process.env.S3_BUCKET} (signed URL GET/HEAD/PUT from any browser origin).`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
