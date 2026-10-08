import { ApiError } from "./errors.ts";
import type { ApiErrorBody } from "./types.ts";
import {
  isSessionProbePath,
  notifyUnauthorized,
  SIGNED_OUT_MESSAGE,
} from "./unauthorized.ts";

function readErrorMessage(body: unknown, status: number) {
  if (body && typeof body === "object" && "error" in body) {
    const message = (body as ApiErrorBody).error;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }
  if (status === 401) {
    return "You are not signed in.";
  }
  if (status === 403) {
    return "You do not have access to this.";
  }
  if (status === 404) {
    return "Not found.";
  }
  if (status === 413) {
    return "This model is too large for one request.";
  }
  return `Request failed (${status})`;
}

function readErrorCode(body: unknown) {
  if (body && typeof body === "object" && "code" in body) {
    const code = (body as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

const CATALOG_CONFLICT_CODE = "catalog-conflict";
const CONFLICT_RETRY_DELAY_MS = 400;

function isReplayableBody(body: RequestInit["body"]) {
  return body == null || typeof body === "string" || (typeof FormData !== "undefined" && body instanceof FormData);
}

/**
 * A 409 `catalog-conflict` means another save landed at the same moment and nothing was
 * written, so one automatic retry is safe. If it conflicts again the friendly server
 * message ("Someone saved at the same moment… try again") reaches the caller as an ApiError.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    return await apiFetchOnce<T>(path, init);
  } catch (cause) {
    const method = (init?.method ?? "GET").toUpperCase();
    if (
      cause instanceof ApiError &&
      cause.status === 409 &&
      cause.code === CATALOG_CONFLICT_CODE &&
      method !== "GET" &&
      method !== "HEAD" &&
      isReplayableBody(init?.body) &&
      !init?.signal?.aborted
    ) {
      await new Promise((resolve) => setTimeout(resolve, CONFLICT_RETRY_DELAY_MS));
      return await apiFetchOnce<T>(path, init);
    }
    throw cause;
  }
}

async function apiFetchOnce<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    const headers = new Headers(init?.headers);
    const isFormData =
      typeof FormData !== "undefined" && init?.body instanceof FormData;
    if (!isFormData && init?.body != null && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    response = await fetch(path, {
      ...init,
      cache: "no-store",
      credentials: "include",
      headers,
    });
  } catch (cause) {
    if (init?.signal?.aborted) {
      throw cause;
    }
    throw new ApiError(
      "Could not reach the API. It may not be available on this preview yet.",
      0,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const body: unknown = isJson
    ? await response.json().catch(() => null)
    : await response.text().catch(() => "");

  if (!response.ok) {
    if (response.status === 401 && !isSessionProbePath(path)) {
      notifyUnauthorized();
      throw new ApiError(SIGNED_OUT_MESSAGE, 401);
    }
    throw new ApiError(
      readErrorMessage(body, response.status),
      response.status,
      readErrorCode(body),
    );
  }

  return body as T;
}
