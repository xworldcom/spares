/** S3-compatible object storage (Cloudflare R2, AWS S3, MinIO). */

export function isS3Configured() {
  return Boolean(
    process.env.S3_ENDPOINT &&
      process.env.S3_BUCKET &&
      process.env.S3_ACCESS_KEY_ID &&
      process.env.S3_SECRET_ACCESS_KEY,
  );
}

export function s3Region() {
  return process.env.S3_REGION?.trim() || "auto";
}

export function s3Bucket() {
  const bucket = process.env.S3_BUCKET?.trim();
  if (!bucket) {
    throw new Error("S3_BUCKET is not set");
  }
  return bucket;
}

export function s3PublicBaseUrl() {
  const base = process.env.S3_PUBLIC_BASE_URL?.trim();
  return base ? base.replace(/\/$/, "") : null;
}

/** CAD models stay private on Vercel — use presigned GET or the auth proxy. */
export function preferSignedModelUrls() {
  return Boolean(process.env.VERCEL);
}

export const DEFAULT_SIGNED_URL_TTL_SECONDS = 3600;
export const MAX_SIGNED_URL_TTL_SECONDS = 3600;
export const DEFAULT_UPLOAD_URL_TTL_SECONDS = 900;

function clampTtlSeconds(raw: string | undefined, fallback: number) {
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, MAX_SIGNED_URL_TTL_SECONDS);
}

/** Lifetime for presigned GET URLs returned in machine `fileUrl`. Capped at one hour. */
export function modelDownloadUrlTtlSeconds() {
  return clampTtlSeconds(
    process.env.S3_SIGNED_URL_TTL_SECONDS,
    DEFAULT_SIGNED_URL_TTL_SECONDS,
  );
}

/** Lifetime for staff presigned PUT tickets. Short so a leaked ticket expires. */
export function modelUploadUrlTtlSeconds() {
  return DEFAULT_UPLOAD_URL_TTL_SECONDS;
}
