import { apiFetch } from "./client";
import { invalidateWarmRead, readIfWarm } from "./warm-read";

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

function lifecycleWarmKey(unreadOnly?: boolean) {
  return unreadOnly ? "lifecycle:notifications:unread" : "lifecycle:notifications";
}

export function invalidateLifecycleNotificationsCache() {
  invalidateWarmRead("lifecycle:notifications");
}

export async function fetchLifecycleNotifications(options?: {
  unreadOnly?: boolean;
  /** Skip warm cache (panel force-refresh). */
  fresh?: boolean;
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
  return readIfWarm(
    warmKey,
    () => apiFetch<LifecycleNotificationsResponse>(path),
    LIFECYCLE_LIST_TTL_MS,
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
