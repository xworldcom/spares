import { requireRole } from "@/lib/auth";
import { toPublicUser } from "@/lib/access";
import { error, isErrorResponse, json, readJson } from "@/lib/http";
import { bulkUpdateCustomerAccess, listSites } from "@/lib/store";

type Body = {
  userIds?: unknown;
  siteIds?: unknown;
  companyAccess?: unknown;
};

export async function POST(request: Request) {
  const auth = await requireRole("staff");
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
    return error("Select at least one account", 400);
  }
  const siteIds = Array.isArray(body.siteIds)
    ? body.siteIds.filter((value): value is string => typeof value === "string")
    : [];
  const companyAccess = Array.isArray(body.companyAccess)
    ? body.companyAccess.filter((value): value is string => typeof value === "string")
    : [];
  const users = await bulkUpdateCustomerAccess(userIds, { siteIds, companyAccess });
  const sites = await listSites();
  return json({ customers: users.map((user) => toPublicUser(user, sites)) });
}
