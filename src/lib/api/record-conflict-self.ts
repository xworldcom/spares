import { isApiError } from "./errors.ts";
import { isRecordConflictError } from "./record-conflict.ts";

export function recordConflictWriterIsSelf(
  cause: unknown,
  viewer: { id: string; email: string },
) {
  if (!isRecordConflictError(cause)) {
    return false;
  }
  if (cause.lastModifiedByUserId && cause.lastModifiedByUserId === viewer.id) {
    return true;
  }
  const who = cause.lastModifiedByName?.trim() ?? "";
  const email = viewer.email.trim().toLowerCase();
  return who.toLowerCase() === email || cause.message.toLowerCase().includes(email);
}

export function isTimeoutLikeError(cause: unknown) {
  return isApiError(cause) && cause.status === 0;
}
