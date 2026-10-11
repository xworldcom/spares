import type { NextRequest } from "next/server";
import { requireTenantStaff } from "@/lib/auth/tenant-scope";
import { respondDerivedList } from "@/lib/derived-list-cache";
import { staffHostDirectoryScopeKey } from "@/lib/list-scope";
import { readTenantHostDirectorySnapshot } from "@/lib/store";

export async function GET(request: NextRequest) {
  const auth = await requireTenantStaff();
  if ("error" in auth) {
    return auth.error;
  }
  const scope = staffHostDirectoryScopeKey(auth.tenantId);
  return respondDerivedList(request, scope, async () => readTenantHostDirectorySnapshot(auth.tenantId));
}
