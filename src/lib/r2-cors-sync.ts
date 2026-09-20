import { PutBucketCorsCommand, S3Client } from "@aws-sdk/client-s3";
import { r2ModelAssetCorsRules } from "./cors.ts";
import { isS3Configured, s3Bucket, s3Region } from "./s3-config.ts";

let sync: Promise<void> | null = null;

export function resetR2CorsSyncForTests() {
  sync = null;
}

/**
 * Keep the private R2 bucket CORS policy in sync with the app so preview
 * hosts can load signed object URLs without streaming through Vercel.
 * No-ops in unit tests. Fail-soft if the API token cannot write CORS.
 */
export async function ensureR2BrowserCors() {
  if (!isS3Configured()) {
    return;
  }
  if (process.env.NODE_TEST_CONTEXT) {
    return;
  }
  if (!process.env.VERCEL && process.env.SPARES_SYNC_R2_CORS !== "true") {
    return;
  }
  if (!sync) {
    sync = applyR2BrowserCors().catch((error) => {
      sync = null;
      console.warn("R2 CORS sync failed", error);
    });
  }
  await sync;
}

async function applyR2BrowserCors() {
  const client = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: s3Region(),
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    },
    forcePathStyle: true,
  });
  try {
    await client.send(
      new PutBucketCorsCommand({
        Bucket: s3Bucket(),
        CORSConfiguration: { CORSRules: r2ModelAssetCorsRules() },
      }),
    );
  } finally {
    client.destroy();
  }
}
