import { requireTenantStaff } from "@/lib/auth/tenant-scope";
import { error, json } from "@/lib/http";
import { ensureLifecycleDemoFixtures } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Idempotent: creates the Hardware fixture machine and its demo lifecycle rows on the host
 * company when they are missing. Works with `SPARES_ALLOW_SEED` off (Production).
 */
export async function POST() {
  const auth = await requireTenantStaff();
  if ("error" in auth) {
    return auth.error;
  }
  if (!auth.user.platformOwner) {
    return error("Only the platform owner can load lifecycle demo data", 403);
  }
  const result = await ensureLifecycleDemoFixtures(auth.tenantId, auth.user.email);
  if (result.status === "wrong_tenant") {
    return error("Lifecycle demo data lives on the host company", 403);
  }
  return json(result);
}
