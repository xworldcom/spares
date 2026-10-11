import { requireTenantUserReadOnly } from "@/lib/auth/tenant-scope";
import { respondDerivedList } from "@/lib/derived-list-cache";
import { listScopeKey } from "@/lib/list-scope";
import type { NextRequest } from "next/server";
import { buildAccessibleTicketsListPayload } from "@/lib/tickets-list-payload";

export const preferredRegion = "iad1";

export async function GET(request: NextRequest) {
  const auth = await requireTenantUserReadOnly();
  if ("error" in auth) {
    return auth.error;
  }

  const scope = listScopeKey("tickets", auth.tenantId, auth.user);
  return respondDerivedList(request, scope, () =>
    buildAccessibleTicketsListPayload(auth.user, auth.tenantId),
  );
}
