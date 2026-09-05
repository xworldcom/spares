import { requireRole } from "@/lib/auth";
import { error, isErrorResponse, json, readJson } from "@/lib/http";
import { listSites, updateCustomerSites } from "@/lib/store";
import { toPublicUser } from "@/lib/access";

type PatchBody = {
  siteIds?: unknown;
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
    : null;
  if (!siteIds) {
    return error("siteIds is required", 400);
  }

  const updated = await updateCustomerSites(id, siteIds);
  if ("error" in updated) {
    return error("Customer not found", 404);
  }

  return json({ user: toPublicUser(updated.user, await listSites()) });
}
