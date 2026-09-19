import { requireTenantStaff } from "@/lib/auth/tenant-scope";
import { listAccountActivity } from "@/lib/activity-log";
import { error, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireTenantStaff();
  if ("error" in auth) {
    return auth.error;
  }

  const url = new URL(request.url);
  const requestedTenantId = url.searchParams.get("tenantId")?.trim() || undefined;
  const account = url.searchParams.get("account")?.trim() || undefined;
  const since = url.searchParams.get("since")?.trim() || undefined;
  const before = url.searchParams.get("before")?.trim() || undefined;
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;

  if (requestedTenantId && !auth.user.platformOwner && requestedTenantId !== auth.tenantId) {
    return error("Forbidden", 403);
  }

  const tenantId = auth.user.platformOwner ? requestedTenantId : auth.tenantId;
  const result = await listAccountActivity({
    tenantId,
    account,
    since,
    before,
    limit: Number.isFinite(limit) ? limit : undefined,
  });

  return json({
    events: result.events,
    accounts: result.accounts,
    total: result.total,
    generatedAt: new Date().toISOString(),
  });
}
