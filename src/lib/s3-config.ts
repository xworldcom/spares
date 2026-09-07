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

/** Default lifetime for presigned GET URLs returned in machine `fileUrl`. */
export function modelDownloadUrlTtlSeconds() {
  const raw = process.env.S3_SIGNED_URL_TTL_SECONDS?.trim();
  if (!raw) {
    return 3600;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 3600;
}
