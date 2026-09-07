import { BLOB_FILES_PREFIX } from "./blob-paths.ts";

/** Client-to-Blob uploads. Comfortable for a 2 GB function that still reads the GLB to join meshes. */
export const CLIENT_PACK_MAX_BYTES = 256 * 1024 * 1024;

/** Multipart fallback through this Next/Vercel app (platform request-body ceiling). */
export const MULTIPART_PACK_MAX_BYTES = 100 * 1024 * 1024;

/** Parts lists stay on the function request; keep them small. */
export const PARTS_LIST_MAX_BYTES = 5 * 1024 * 1024;

export function formatMegabytes(bytes: number) {
  const mb = bytes / (1024 * 1024);
  if (mb >= 10) {
    return String(Math.round(mb));
  }
  const rounded = Math.round(mb * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function packOverLimitMessage(bytes: number, limitBytes: number) {
  return `This model is ${formatMegabytes(bytes)} MB. Staff packs can be up to ${formatMegabytes(limitBytes)} MB. Export a smaller GLB, or split the assembly.`;
}

export function multipartTooLargeMessage() {
  return "This model is too large to send through the server. With S3/R2 object storage configured, the GLB goes straight to storage (up to 256 MB). With Vercel Blob attached instead, use client upload (up to 256 MB). Otherwise keep the file under 100 MB.";
}

export function platform413Message() {
  return "This model is too large to send through the server in one request. With Blob storage attached, the GLB goes straight to storage (up to 256 MB).";
}

export function storedFileNameFromUploadPath(pathname: string) {
  const trimmed = pathname.replace(/^\/+/, "");
  const base = trimmed.startsWith(BLOB_FILES_PREFIX)
    ? trimmed.slice(BLOB_FILES_PREFIX.length)
    : trimmed;
  if (!base || base.includes("/") || !/^[A-Za-z0-9._-]+$/.test(base)) {
    throw new Error("Invalid stored file name");
  }
  return base;
}

export function machineBlobPathname(storedFileName: string) {
  return `${BLOB_FILES_PREFIX}${storedFileNameFromUploadPath(storedFileName)}`;
}
