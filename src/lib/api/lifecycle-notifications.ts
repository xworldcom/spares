import { apiFetch } from "./client";
import { SPARES_BACKGROUND_FETCH, backgroundFetchHeaders } from "./background-fetch";
import { ApiError } from "./errors";
import { fetchWithDeadline, isAbortError } from "./fetch-deadline";
import { invalidateWarmRead, readIfWarm, warmRead } from "./warm-read";

export type LifecycleNotification = {
  id: string;
  partNumber: string;
  partName: string;
  kind: "part_obsolete";
  machineIds: string[];
  machineNames: string[];
  successorPartNumber?: string;
  discontinuationDate?: string;
  createdAt: string;
  readAt?: string;
  unread: boolean;
};

export type LifecycleNotificationsResponse = {
  notifications: LifecycleNotification[];
  unreadCount: number;
  generatedAt: string;
};

const LIFECYCLE_LIST_TTL_MS = 30_000;

type LifecycleSlot = {
  path: string;
  etag?: string;
  body?: LifecycleNotificationsResponse;
};

function lifecycleSlots() {
  const root = globalThis as typeof globalThis & {
    __sparesLifecycleFetchSlots?: Map<string, LifecycleSlot>;
  };
  if (!root.__sparesLifecycleFetchSlots) {
    root.__sparesLifecycleFetchSlots = new Map();
  }
  return root.__sparesLifecycleFetchSlots;
}

function slotFor(warmKey: string, path: string): LifecycleSlot {
  const slots = lifecycleSlots();
  const existing = slots.get(warmKey);
  if (existing) {
    return existing;
  }
  const slot: LifecycleSlot = { path };
  slots.set(warmKey, slot);
  return slot;
}

function lifecycleWarmKey(unreadOnly?: boolean) {
  return unreadOnly ? "lifecycle:notifications:unread" : "lifecycle:notifications";
}

function invalidateLifecycleSlots() {
  lifecycleSlots().clear();
}

export function invalidateLifecycleNotificationsCache() {
  invalidateWarmRead("lifecycle:notifications");
  invalidateLifecycleSlots();
}

async function fetchLifecycleOnce(
  path: string,
  warmKey: string,
  init?: RequestInit,
): Promise<LifecycleNotificationsResponse | undefined> {
  const slot = slotFor(warmKey, path);
  const headers = new Headers(init?.headers);
  if (slot.etag && slot.body !== undefined) {
    headers.set("If-None-Match", slot.etag);
  }

  let response: Response;
  try {
    response = await fetchWithDeadline(path, {
      ...init,
      method: "GET",
      cache: "no-store",
      credentials: "include",
      headers,
    });
  } catch (cause) {
    if (init?.signal?.aborted || isAbortError(cause)) {
      throw cause;
    }
    throw new ApiError("Could not reach OEE360. Check your network and try again.", 0);
  }

  if (response.status === 304) {
    if (slot.body !== undefined) {
      return slot.body;
    }
    return undefined;
  }

  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const body: unknown = isJson
    ? await response.json().catch(() => null)
    : await response.text().catch(() => "");

  if (!response.ok) {
    throw new ApiError(
      typeof body === "object" && body && "error" in body
        ? String((body as { error?: unknown }).error)
        : `Request failed (${response.status})`,
      response.status,
    );
  }

  const nextEtag = response.headers.get("etag");
  if (nextEtag) {
    slot.etag = nextEtag;
  }
  slot.body = body as LifecycleNotificationsResponse;
  return slot.body;
}

async function loadLifecycleBody(
  path: string,
  warmKey: string,
  init?: RequestInit,
): Promise<LifecycleNotificationsResponse> {
  const slot = slotFor(warmKey, path);
  const headers = new Headers(init?.headers);
  const background = headers.get(SPARES_BACKGROUND_FETCH) === "1";

  if (!background && slot.body !== undefined) {
    void fetchLifecycleOnce(path, warmKey, {
      headers: backgroundFetchHeaders(),
    }).catch(() => {
      invalidateWarmRead(warmKey);
      slot.etag = undefined;
      slot.body = undefined;
    });
    return slot.body;
  }

  const attempt = async () => {
    let fresh = await fetchLifecycleOnce(path, warmKey, init);
    if (fresh !== undefined) {
      return fresh;
    }
    slot.etag = undefined;
    const retry = await fetchLifecycleOnce(path, warmKey, init);
    if (retry === undefined) {
      throw new ApiError("Lifecycle notifications response missing body.", 500);
    }
    return retry;
  };

  try {
    return await attempt();
  } catch (cause) {
    if (init?.signal?.aborted || isAbortError(cause)) {
      invalidateWarmRead(warmKey);
      throw cause;
    }
    invalidateWarmRead(warmKey);
    return await attempt();
  }
}

export async function fetchLifecycleNotifications(options?: {
  unreadOnly?: boolean;
  /** Skip warm cache (panel force-refresh). */
  fresh?: boolean;
  /** Stale-while-revalidate: return cached rows and refresh in the background. */
  background?: boolean;
}) {
  if (options?.fresh) {
    invalidateLifecycleNotificationsCache();
  }
  const params = new URLSearchParams();
  if (options?.unreadOnly) {
    params.set("unread", "1");
  }
  const query = params.toString();
  const path = `/api/notifications/lifecycle${query ? `?${query}` : ""}`;
  const warmKey = lifecycleWarmKey(options?.unreadOnly);
  const init =
    options?.background ? { headers: backgroundFetchHeaders() } : undefined;
  return readIfWarm(
    warmKey,
    () => loadLifecycleBody(path, warmKey, init),
    LIFECYCLE_LIST_TTL_MS,
  );
}

export function prefetchLifecycleNotifications() {
  warmRead("lifecycle:notifications", () =>
    fetchLifecycleNotifications({ background: true }),
  );
}

export async function markLifecycleNotificationRead(id: string) {
  const data = await apiFetch<{ ok: true; unreadCount: number }>("/api/notifications/lifecycle", {
    method: "PATCH",
    body: JSON.stringify({ id }),
  });
  invalidateLifecycleNotificationsCache();
  return data;
}

export async function markAllLifecycleNotificationsRead() {
  const data = await apiFetch<{ ok: true; unreadCount: number }>("/api/notifications/lifecycle", {
    method: "PATCH",
    body: JSON.stringify({ markAll: true }),
  });
  invalidateLifecycleNotificationsCache();
  return data;
}
