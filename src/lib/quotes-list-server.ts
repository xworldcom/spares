import { getCurrentUser } from "@/lib/auth";
import type { QuotesListResponse } from "@/lib/api/types";
import { buildQuotesListPayload } from "@/lib/quotes-list-payload";
import { tenantIdForUser } from "@/lib/tenant";

/** Server-rendered quotes hub list (avoids client fetch queue under multi-tab load). */
export async function loadQuotesListForSession(): Promise<QuotesListResponse | null> {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }
  const tenantId = tenantIdForUser(user);
  if (!tenantId) {
    return null;
  }
  return buildQuotesListPayload(user, tenantId);
}
