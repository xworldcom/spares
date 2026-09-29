import { isS3Configured } from "./s3-config.ts";

const LOCAL_DEV_SECRET = "spares-not-live-local-secret";

export function isManagedRuntime() {
  return Boolean(process.env.VERCEL);
}

/** Demo fixtures and preview passwords — off on Vercel unless explicitly enabled. */
export function isSeedAllowed() {
  const flag = process.env.SPARES_ALLOW_SEED?.trim().toLowerCase();
  if (flag === "true" || flag === "1") {
    return true;
  }
  if (flag === "false" || flag === "0") {
    return false;
  }
  return !isManagedRuntime();
}

/** Fail closed on Vercel when required secrets or object storage are missing. */
export function assertManagedRuntimeEnv() {
  if (!isManagedRuntime()) {
    return;
  }

  const authSecret = process.env.AUTH_SECRET?.trim();
  if (!authSecret || authSecret === LOCAL_DEV_SECRET) {
    throw new Error(
      "AUTH_SECRET must be set to a long random value on Vercel. Do not use the local development default.",
    );
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN is required on Vercel. Attach a Blob store. Quotes, users, and machine metadata cannot use /tmp.",
    );
  }

  if (!isS3Configured()) {
    throw new Error(
      "S3 object storage is required on Vercel. Set S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY.",
    );
  }
}
