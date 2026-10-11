import { isAbortError } from "./fetch-deadline.ts";

export const NETWORK_TIMEOUT_MESSAGE =
  "That took too long. Check your connection and try again.";

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly recordVersion?: number;
  readonly lastModifiedAt?: string;
  readonly lastModifiedByName?: string;

  constructor(
    message: string,
    status: number,
    code?: string,
    recordMeta?: {
      recordVersion?: number;
      lastModifiedAt?: string;
      lastModifiedByName?: string;
    },
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.recordVersion = recordMeta?.recordVersion;
    this.lastModifiedAt = recordMeta?.lastModifiedAt;
    this.lastModifiedByName = recordMeta?.lastModifiedByName;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function isUnauthorized(error: unknown) {
  return isApiError(error) && error.status === 401;
}

export function isForbidden(error: unknown) {
  return isApiError(error) && error.status === 403;
}

export function isNotFound(error: unknown) {
  return isApiError(error) && error.status === 404;
}

export function errorMessage(error: unknown, fallback = "Something went wrong") {
  if (isAbortError(error)) {
    return NETWORK_TIMEOUT_MESSAGE;
  }
  if (isApiError(error)) {
    return error.message;
  }
  if (error instanceof Error) {
    if (/aborted without reason|AbortError|operation was aborted/i.test(error.message)) {
      return NETWORK_TIMEOUT_MESSAGE;
    }
    return error.message;
  }
  return fallback;
}
