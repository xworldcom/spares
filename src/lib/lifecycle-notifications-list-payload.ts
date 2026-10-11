import type { LifecycleNotificationsResponse } from "@/lib/api/lifecycle-notifications";
import { toPublicLifecycleNotification } from "@/lib/lifecycle-notifications";
import { getUserLifecycleNotificationsBundle } from "@/lib/store";

export async function buildLifecycleNotificationsPayload(
  tenantId: string,
  userId: string,
  options?: { unreadOnly?: boolean },
): Promise<LifecycleNotificationsResponse> {
  const { notifications: rows, unreadCount } = await getUserLifecycleNotificationsBundle(
    tenantId,
    userId,
    { unreadOnly: options?.unreadOnly },
  );
  return {
    notifications: rows.map(toPublicLifecycleNotification),
    unreadCount,
    generatedAt: new Date().toISOString(),
  };
}
