import { ApiError } from "./errors.ts";
import {
  isSessionProbePath,
  notifyUnauthorized,
  SIGNED_OUT_MESSAGE,
} from "./unauthorized.ts";
import { SPARES_BACKGROUND_FETCH } from "./background-fetch.ts";
import { peekWarmResolved, readIfWarm, warmRead } from "./warm-read.ts";

const listEtags = new Map<string, string>();

function readErrorMessage(body: unknown, status: number) {
  if (body && typeof body === "object" && "error" in body) {
    const message = (body as { error?: unknown }).error;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }
  if (status === 401) {
    return "You are not signed in.";
  }
  return `Request failed (${status})`;
}

export function invalidateListEtag(path: string) {
  listEtags.delete(path);
}

/**
 * GET list with If-None-Match + warm-read reuse on 304 (pairs with respondDerivedList).
 */
async function fetchListOnce<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  const etag = listEtags.get(path);
  if (etag) {
    headers.set("If-None-Match", etag);
  }

  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      method: "GET",
      cache: "no-store",
      credentials: "include",
      headers,
    });
  } catch (cause) {
    if (init?.signal?.aborted) {
      throw cause;
    }
    throw new ApiError("Could not reach OEE360. Check your network and try again.", 0);
  }

  if (response.status === 304) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const body: unknown = isJson
    ? await response.json().catch(() => null)
    : await response.text().catch(() => "");

  if (!response.ok) {
    if (response.status === 401 && !isSessionProbePath(path)) {
      const background = headers.get(SPARES_BACKGROUND_FETCH) === "1";
      if (!background) {
        notifyUnauthorized();
      }
      throw new ApiError(SIGNED_OUT_MESSAGE, 401);
    }
    throw new ApiError(readErrorMessage(body, response.status), response.status);
  }

  const nextEtag = response.headers.get("etag");
  if (nextEtag) {
    listEtags.set(path, nextEtag);
  }
  return body as T;
}

export async function apiFetchList<T>(
  path: string,
  warmKey: string,
  init?: RequestInit,
): Promise<T> {
  return readIfWarm(warmKey, async () => {
    const fresh = await fetchListOnce<T>(path, init);
    if (fresh !== undefined) {
      return fresh;
    }
    const cached = await peekWarmResolved<T>(warmKey);
    if (cached !== undefined) {
      return cached;
    }
    listEtags.delete(path);
    const retry = await fetchListOnce<T>(path, init);
    if (retry === undefined) {
      throw new ApiError("List response missing body.", 500);
    }
    return retry;
  });
}

/** Fire-and-forget list warm (idle prefetch). */
export function prefetchList(path: string, warmKey: string) {
  warmRead(warmKey, () => apiFetchList(path, warmKey, { headers: { [SPARES_BACKGROUND_FETCH]: "1" } }));
}
