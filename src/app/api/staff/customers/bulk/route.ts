import { requireTenantStaff } from "@/lib/auth/tenant-scope";
import { toPublicUser } from "@/lib/access";
import { error, isErrorResponse, json, readJson } from "@/lib/http";
import { bulkUpdateCustomerAccess, getOrgContext } from "@/lib/store";

type Body = {
  userIds?: unknown;
  siteIds?: unknown;
};

export async function POST(request: Request) {
  const auth = await requireTenantStaff();
  if ("error" in auth) {
    return auth.error;
  }
  const body = await readJson<Body>(request);
  if (isErrorResponse(body)) {
    return body;
  }
  const userIds = Array.isArray(body.userIds)
    ? body.userIds.filter((value): value is string => typeof value === "string")
    : [];
  if (userIds.length === 0) {
    return error("Select at least one person", 400);
  }
  const siteIds = Array.isArray(body.siteIds)
    ? body.siteIds.filter((value): value is string => typeof value === "string")
    : [];
  const users = await bulkUpdateCustomerAccess(auth.tenantId, userIds, { siteIds });
  const org = await getOrgContext(auth.tenantId);
  return json({
    customers: users.map((user) => toPublicUser(user, org.sites, org.customers)),
  });
}
