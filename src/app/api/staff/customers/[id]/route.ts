import { requireTenantStaff } from "@/lib/auth/tenant-scope";
import { error, isErrorResponse, json, readJson, withCatalogConflict } from "@/lib/http";
import { actorFromUser, recordAccountActivity } from "@/lib/activity-log";
import { deletePerson, getOrgContext, updatePerson } from "@/lib/store";
import { toPublicUser } from "@/lib/access";

type PatchBody = {
  name?: unknown;
  email?: unknown;
  siteIds?: unknown;
  machineIds?: unknown;
  lifecycleNotifyObsolete?: unknown;
};

async function handlePATCH(
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
  const lifecycleNotifyObsolete =
    typeof body.lifecycleNotifyObsolete === "boolean"
      ? body.lifecycleNotifyObsolete
      : undefined;

  if (
    name === undefined &&
    email === undefined &&
    siteIds === undefined &&
    machineIds === undefined &&
    lifecycleNotifyObsolete === undefined
  ) {
    return error("name, email, siteIds, machineIds, or lifecycleNotifyObsolete is required", 400);
  }

  const updated = await updatePerson(id, auth.tenantId, {
    ...(name !== undefined ? { name } : {}),
    ...(email !== undefined ? { email } : {}),
    ...(siteIds !== undefined ? { siteIds } : {}),
    ...(machineIds !== undefined ? { machineIds } : {}),
    ...(lifecycleNotifyObsolete !== undefined ? { lifecycleNotifyObsolete } : {}),
  });
  if ("error" in updated) {
    if (updated.error === "email-taken") {
      return error("A user with that email already exists", 409);
    }
    if (updated.error === "bad-email") {
      return error("Email is required", 400);
    }
    if (updated.error === "protected") {
      return error("That demo login is protected and cannot be changed", 400);
    }
    return error("Person not found", 404);
  }

  await recordAccountActivity({
    tenantId: auth.tenantId,
    actor: actorFromUser(auth.user),
    action: "person.updated",
    summary: `${auth.user.email} updated person ${updated.user.email}.`,
    target: { type: "person", id: updated.user.id, label: updated.user.email },
  });

  const org = await getOrgContext(auth.tenantId);
  return json({ user: toPublicUser(updated.user, org.sites, org.customers) });
}

async function handleDELETE(
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
    if (removed.error === "protected") {
      return error("That demo login is protected and cannot be removed", 400);
    }
    return error("Person not found", 404);
  }

  await recordAccountActivity({
    tenantId: auth.tenantId,
    actor: actorFromUser(auth.user),
    action: "person.deleted",
    summary: `${auth.user.email} removed person ${id}.`,
    target: { type: "person", id },
  });
  return json({ ok: true });
}

export const PATCH = withCatalogConflict(handlePATCH);
export const DELETE = withCatalogConflict(handleDELETE);
