import { ApiError } from "./errors.ts";
import {
  isSessionProbePath,
  notifyUnauthorized,
  SIGNED_OUT_MESSAGE,
} from "./unauthorized.ts";
import { SPARES_BACKGROUND_FETCH } from "./background-fetch.ts";
import { readIfWarm, warmRead } from "./warm-read.ts";

type ListSlot = {
  path: string;
  etag?: string;
  body?: unknown;
};

const listSlots = new Map<string, ListSlot>();

function slotFor(warmKey: string, path: string): ListSlot {
  const existing = listSlots.get(warmKey);
  if (existing) {
    return existing;
  }
  const slot: ListSlot = { path };
  listSlots.set(warmKey, slot);
  return slot;
}

export function clearListFetchStateForTests() {
  listSlots.clear();
}

/** Test-only: etag without body (stale client state). */
export function seedListSlotForTests(
  warmKey: string,
  path: string,
  etag: string,
  body?: unknown,
) {
  listSlots.set(warmKey, { path, etag, body });
}

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
  for (const slot of listSlots.values()) {
    if (slot.path === path) {
      slot.etag = undefined;
      slot.body = undefined;
    }
  }
}

/**
 * GET list with If-None-Match only when this tab holds a body for the warm key
 * (pairs with respondDerivedList). Safari exposes 304 to JS — never treat 304 as
 * success without a cached body.
 */
async function fetchListOnce<T>(
  path: string,
  warmKey: string,
  init?: RequestInit,
): Promise<T | undefined> {
  const slot = slotFor(warmKey, path);
  const headers = new Headers(init?.headers);
  if (slot.etag && slot.body !== undefined) {
    headers.set("If-None-Match", slot.etag);
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
    if (slot.body !== undefined) {
      return slot.body as T;
    }
    return undefined;
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
    slot.etag = nextEtag;
  }
  slot.body = body;
  return body as T;
}

export async function apiFetchList<T>(
  path: string,
  warmKey: string,
  init?: RequestInit,
): Promise<T> {
  return readIfWarm(warmKey, async () => {
    let fresh = await fetchListOnce<T>(path, warmKey, init);
    if (fresh !== undefined) {
      return fresh;
    }
    const slot = slotFor(warmKey, path);
    slot.etag = undefined;
    const retry = await fetchListOnce<T>(path, warmKey, init);
    if (retry === undefined) {
      throw new ApiError("List response missing body.", 500);
    }
    return retry;
  });
}

/** Fire-and-forget list warm (idle prefetch). */
export function prefetchList(path: string, warmKey: string) {
  warmRead(warmKey, () =>
    apiFetchList(path, warmKey, { headers: { [SPARES_BACKGROUND_FETCH]: "1" } }),
  );
}
