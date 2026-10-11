import { getCurrentUser } from "@/lib/auth";
import type { MachinesListResponse } from "@/lib/api/types";
import { buildMachinesListPayload } from "@/lib/machines-list-payload";
import { tenantIdForUser } from "@/lib/tenant";

/** Server-rendered machines hub list (avoids client fetch queue on cold navigation). */
export async function loadMachinesListForSession(): Promise<MachinesListResponse | null> {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }
  const tenantId = tenantIdForUser(user);
  if (!tenantId) {
    return null;
  }
  return buildMachinesListPayload(user, tenantId);
}
