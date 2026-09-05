import { requireRole } from "@/lib/auth";
import { error, isErrorResponse, json, readJson } from "@/lib/http";
import { listSites, updateCustomerSites } from "@/lib/store";
import { toPublicUser } from "@/lib/access";

type PatchBody = {
  siteIds?: unknown;
  companyAccess?: unknown;
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("staff");
  if ("error" in auth) {
    return auth.error;
  }

  const { id } = await params;
  const body = await readJson<PatchBody>(request);
  if (isErrorResponse(body)) {
    return body;
  }

  const siteIds = Array.isArray(body.siteIds)
    ? body.siteIds.filter((value): value is string => typeof value === "string")
    : [];
  const companyAccess = Array.isArray(body.companyAccess)
    ? body.companyAccess.filter((value): value is string => typeof value === "string")
    : [];
  if (!("siteIds" in body) && !("companyAccess" in body)) {
    return error("siteIds or companyAccess is required", 400);
  }

  const updated = await updateCustomerSites(id, { siteIds, companyAccess });
  if ("error" in updated) {
    return error("Customer not found", 404);
  }

  return json({ user: toPublicUser(updated.user, await listSites()) });
}
