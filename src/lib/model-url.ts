import {
  isS3Configured,
  preferSignedModelUrls,
  s3PublicBaseUrl,
} from "./s3-config.ts";

const SAFE_NAME = /^[A-Za-z0-9._-]+$/;

export function safeModelFileName(storedFileName: string) {
  const base = storedFileName.split(/[/\\]/).pop() ?? "";
  if (!base || base !== storedFileName || !SAFE_NAME.test(base)) {
    throw new Error("Invalid stored file name");
  }
  return base;
}

export function modelObjectKey(storedFileName: string) {
  return `models/${safeModelFileName(storedFileName)}`;
}

export function modelPublicUrl(storedFileName: string): string | null {
  if (preferSignedModelUrls()) {
    return null;
  }
  const base = s3PublicBaseUrl();
  if (!base || !isS3Configured()) {
    return null;
  }
  return `${base}/${modelObjectKey(storedFileName)}`;
}
