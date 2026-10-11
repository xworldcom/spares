import { getCurrentUser } from "@/lib/auth";
import type { LifecycleNotificationsResponse } from "@/lib/api/lifecycle-notifications";
import { buildLifecycleNotificationsPayload } from "@/lib/lifecycle-notifications-list-payload";
import { tenantIdForUser } from "@/lib/tenant";

export async function loadLifecycleNotificationsForSession(): Promise<LifecycleNotificationsResponse | null> {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }
  const tenantId = tenantIdForUser(user);
  if (!tenantId) {
    return null;
  }
  return buildLifecycleNotificationsPayload(tenantId, user.id);
}
