import {
  CLIENT_PACK_MAX_BYTES,
  MODEL_PROXY_MAX_BYTES,
  MULTIPART_PACK_MAX_BYTES,
  multipartTooLargeMessage,
} from "./pack-limits.ts";

export type ModelUploadAvailability = {
  clientUpload: boolean;
  s3Upload: boolean;
  maxBytes: number;
  vercelRuntime?: boolean;
};

export type ModelUploadStrategy =
  | { mode: "s3" }
  | { mode: "blob" }
  | { mode: "multipart" }
  | { mode: "refuse"; message: string; status: number };

export function isVercelRuntime() {
  return Boolean(process.env.VERCEL);
}

export function vercelRequiresObjectStorageMessage() {
  return "Large GLB models cannot upload on Vercel without object storage. Set S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY (Cloudflare R2 recommended) on this environment, then redeploy.";
}

export function modelUploadTicketFailedMessage() {
  return "Could not reach the model upload service. Sign in as staff and try again. If this keeps happening, check that R2/S3 credentials are set on this environment.";
}

export function s3MultipartRefusedMessage() {
  return "GLB files must upload directly to object storage on this environment. Do not send the model through the server — use the presigned upload path or fix R2/S3 credentials.";
}

export function vercelLargeModelProxyMessage(bytes: number) {
  const mb = Math.round(bytes / (1024 * 1024));
  return `This model is ${mb} MB and is too large to stream through Vercel. Wire R2/S3 object storage (S3_* env vars) or re-upload a pack under 5 MB.`;
}

export function blobUploadMaxBytes(availability: ModelUploadAvailability) {
  if (availability.s3Upload) {
    return CLIENT_PACK_MAX_BYTES;
  }
  if (availability.vercelRuntime) {
    return MODEL_PROXY_MAX_BYTES;
  }
  return CLIENT_PACK_MAX_BYTES;
}

export function resolveModelUploadStrategy(
  availability: ModelUploadAvailability | null,
  modelSize: number,
): ModelUploadStrategy {
  if (!availability) {
    return {
      mode: "refuse",
      message: modelUploadTicketFailedMessage(),
      status: 503,
    };
  }

  if (availability.s3Upload) {
    return { mode: "s3" };
  }

  if (availability.vercelRuntime) {
    if (!availability.clientUpload) {
      return {
        mode: "refuse",
        message: vercelRequiresObjectStorageMessage(),
        status: 503,
      };
    }
    if (modelSize > MODEL_PROXY_MAX_BYTES) {
      return {
        mode: "refuse",
        message: vercelRequiresObjectStorageMessage(),
        status: 413,
      };
    }
    return { mode: "blob" };
  }

  if (availability.clientUpload) {
    return { mode: "blob" };
  }

  if (modelSize > MULTIPART_PACK_MAX_BYTES) {
    return {
      mode: "refuse",
      message: multipartTooLargeMessage(),
      status: 413,
    };
  }

  return { mode: "multipart" };
}

export function refuseMultipartModelInForm(modelSize: number) {
  if (isS3ConfiguredForPolicy()) {
    return {
      error: s3MultipartRefusedMessage(),
      status: 400,
    };
  }
  if (isVercelRuntime() && modelSize > MODEL_PROXY_MAX_BYTES) {
    return {
      error: vercelRequiresObjectStorageMessage(),
      status: 413,
    };
  }
  if (isVercelRuntime()) {
    return {
      error: vercelRequiresObjectStorageMessage(),
      status: 413,
    };
  }
  return null;
}

function isS3ConfiguredForPolicy() {
  return Boolean(
    process.env.S3_ENDPOINT &&
      process.env.S3_BUCKET &&
      process.env.S3_ACCESS_KEY_ID &&
      process.env.S3_SECRET_ACCESS_KEY,
  );
}
