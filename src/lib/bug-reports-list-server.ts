import { getCurrentUser } from "@/lib/auth";
import type { BugReportsListResponse } from "@/lib/api/types";
import { buildBugReportsListPayload } from "@/lib/bug-reports-list-payload";
import { tenantIdForUser } from "@/lib/tenant";

export async function loadBugReportsListForSession(): Promise<BugReportsListResponse | null> {
  const user = await getCurrentUser();
  if (!user || user.role !== "staff") {
    return null;
  }
  const tenantId = tenantIdForUser(user);
  if (!tenantId) {
    return null;
  }
  return buildBugReportsListPayload(tenantId);
}
