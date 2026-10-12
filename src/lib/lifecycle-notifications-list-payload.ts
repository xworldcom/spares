import type { LifecycleNotificationsResponse } from "@/lib/api/lifecycle-notifications";
import { toPublicLifecycleNotification } from "@/lib/lifecycle-notifications";
import { normalizePartNumber } from "@/lib/part-lifecycle";
import { getUserLifecycleNotificationsBundle } from "@/lib/store";

export async function buildLifecycleNotificationsPayload(
  tenantId: string,
  userId: string,
  options?: { unreadOnly?: boolean },
): Promise<LifecycleNotificationsResponse> {
  const { notifications: rows, unreadCount, lifecycleStatusByPart } =
    await getUserLifecycleNotificationsBundle(tenantId, userId, {
      unreadOnly: options?.unreadOnly,
    });
  return {
    notifications: rows.map((row) =>
      toPublicLifecycleNotification(
        row,
        lifecycleStatusByPart.get(normalizePartNumber(row.partNumber)) ?? "obsolete",
      ),
    ),
    unreadCount,
    generatedAt: new Date().toISOString(),
  };
}
