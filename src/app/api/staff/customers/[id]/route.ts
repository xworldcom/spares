import { requireRole } from "@/lib/auth";
import { error, isErrorResponse, json, readJson } from "@/lib/http";
import { listSites, updateCustomerSites } from "@/lib/store";
import { toPublicUser } from "@/lib/access";

type PatchBody = {
  siteIds?: unknown;
  companyAccess?: unknown;
  machineIds?: unknown;
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
  const machineIds = Array.isArray(body.machineIds)
    ? body.machineIds.filter((value): value is string => typeof value === "string")
    : [];
  if (!("siteIds" in body) && !("companyAccess" in body) && !("machineIds" in body)) {
    return error("siteIds, companyAccess, or machineIds is required", 400);
  }

  const updated = await updateCustomerSites(id, { siteIds, companyAccess, machineIds });
  if ("error" in updated) {
    return error("Customer not found", 404);
  }

  return json({ user: toPublicUser(updated.user, await listSites()) });
}
