import type { NextRequest } from "next/server";
import { requirePlatformOwner } from "@/lib/auth/tenant-scope";
import { respondDerivedList } from "@/lib/derived-list-cache";
import { platformDirectoryScopeKey } from "@/lib/list-scope";
import { readPlatformDirectorySnapshot } from "@/lib/store";

export async function GET(request: NextRequest) {
  const auth = await requirePlatformOwner();
  if ("error" in auth) {
    return auth.error;
  }
  const scope = platformDirectoryScopeKey();
  return respondDerivedList(request, scope, async () => {
    const entries = await readPlatformDirectorySnapshot();
    return { entries };
  });
}
