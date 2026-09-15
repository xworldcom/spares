import { requirePlatformOwner } from "@/lib/auth/tenant-scope";
import { json } from "@/lib/http";
import { listStaffUsersForPlatform } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requirePlatformOwner();
  if ("error" in auth) {
    return auth.error;
  }
  const staff = await listStaffUsersForPlatform();
  return json({ staff });
}
