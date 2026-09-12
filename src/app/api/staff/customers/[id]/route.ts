import { requireRole } from "@/lib/auth";
import { error, isErrorResponse, json, readJson } from "@/lib/http";
import { deletePerson, getOrgContext, updateCustomerSites } from "@/lib/store";
import { toPublicUser } from "@/lib/access";

type PatchBody = {
  siteIds?: unknown;
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
    : undefined;
  const machineIds = Array.isArray(body.machineIds)
    ? body.machineIds.filter((value): value is string => typeof value === "string")
    : undefined;
  if (siteIds === undefined && machineIds === undefined) {
    return error("siteIds or machineIds is required", 400);
  }

  const updated = await updateCustomerSites(id, {
    ...(siteIds !== undefined ? { siteIds } : {}),
    ...(machineIds !== undefined ? { machineIds } : {}),
  });
  if ("error" in updated) {
    return error("Person not found", 404);
  }

  const org = await getOrgContext();
  return json({ user: toPublicUser(updated.user, org.sites, org.customers) });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("staff");
  if ("error" in auth) {
    return auth.error;
  }

  const { id } = await params;
  const removed = await deletePerson(id);
  if ("error" in removed) {
    return error("Person not found", 404);
  }
  return json({ ok: true });
}
