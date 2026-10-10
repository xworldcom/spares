import { apiFetch } from "./client";

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

export async function fetchLifecycleNotifications(options?: { unreadOnly?: boolean }) {
  const params = new URLSearchParams();
  if (options?.unreadOnly) {
    params.set("unread", "1");
  }
  const query = params.toString();
  return apiFetch<LifecycleNotificationsResponse>(
    `/api/notifications/lifecycle${query ? `?${query}` : ""}`,
  );
}

export async function markLifecycleNotificationRead(id: string) {
  return apiFetch<{ ok: true; unreadCount: number }>("/api/notifications/lifecycle", {
    method: "PATCH",
    body: JSON.stringify({ id }),
  });
}

export async function markAllLifecycleNotificationsRead() {
  return apiFetch<{ ok: true; unreadCount: number }>("/api/notifications/lifecycle", {
    method: "PATCH",
    body: JSON.stringify({ markAll: true }),
  });
}
