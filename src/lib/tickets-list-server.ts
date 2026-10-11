import { getCurrentUser } from "@/lib/auth";
import type { TicketsListResponse } from "@/lib/api/types";
import { buildAccessibleTicketsListPayload } from "@/lib/tickets-list-payload";
import { tenantIdForUser } from "@/lib/tenant";

export async function loadAccessibleTicketsListForSession(): Promise<TicketsListResponse | null> {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }
  const tenantId = tenantIdForUser(user);
  if (!tenantId) {
    return null;
  }
  return buildAccessibleTicketsListPayload(user, tenantId);
}
