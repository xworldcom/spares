import { requireTenantStaff } from "@/lib/auth/tenant-scope";
import { error, isErrorResponse, json, readJson } from "@/lib/http";
import { deletePerson, getOrgContext, updatePerson } from "@/lib/store";
import { toPublicUser } from "@/lib/access";

type PatchBody = {
  name?: unknown;
  email?: unknown;
  siteIds?: unknown;
  machineIds?: unknown;
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireTenantStaff();
  if ("error" in auth) {
    return auth.error;
  }

  const { id } = await params;
  const body = await readJson<PatchBody>(request);
  if (isErrorResponse(body)) {
    return body;
  }

  const name =
    body.name === null
      ? null
      : typeof body.name === "string"
        ? body.name
        : undefined;
  const email = typeof body.email === "string" ? body.email.trim() : undefined;
  const siteIds = Array.isArray(body.siteIds)
    ? body.siteIds.filter((value): value is string => typeof value === "string")
    : undefined;
  const machineIds = Array.isArray(body.machineIds)
    ? body.machineIds.filter((value): value is string => typeof value === "string")
    : undefined;

  if (
    name === undefined &&
    email === undefined &&
    siteIds === undefined &&
    machineIds === undefined
  ) {
    return error("name, email, siteIds, or machineIds is required", 400);
  }

  const updated = await updatePerson(id, auth.tenantId, {
    ...(name !== undefined ? { name } : {}),
    ...(email !== undefined ? { email } : {}),
    ...(siteIds !== undefined ? { siteIds } : {}),
    ...(machineIds !== undefined ? { machineIds } : {}),
  });
  if ("error" in updated) {
    if (updated.error === "email-taken") {
      return error("A user with that email already exists", 409);
    }
    if (updated.error === "bad-email") {
      return error("Email is required", 400);
    }
    return error("Person not found", 404);
  }

  const org = await getOrgContext(auth.tenantId);
  return json({ user: toPublicUser(updated.user, org.sites, org.customers) });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireTenantStaff();
  if ("error" in auth) {
    return auth.error;
  }

  const { id } = await params;
  const removed = await deletePerson(id, auth.tenantId);
  if ("error" in removed) {
    return error("Person not found", 404);
  }
  return json({ ok: true });
}
