import { requireTenantStaff } from "@/lib/auth/tenant-scope";
import { error, isErrorResponse, json, readJson, withCatalogConflict } from "@/lib/http";
import { actorFromUser, recordAccountActivity } from "@/lib/activity-log";
import { deleteSite, updateSite } from "@/lib/store";

export const dynamic = "force-dynamic";

type PatchBody = {
  name?: unknown;
  customerId?: unknown;
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

  const patch: { name?: string; customerId?: string } = {};
  if (typeof body.name === "string") {
    patch.name = body.name;
  }
  if (typeof body.customerId === "string") {
    patch.customerId = body.customerId;
  }
  if (!patch.name && !patch.customerId) {
    return error("name or customerId is required", 400);
  }

  const updated = await updateSite(id, auth.tenantId, patch);
  if ("error" in updated) {
    if (updated.error === "taken") {
      return error("That site already exists for this customer", 409);
    }
    if (updated.error === "bad-customer") {
      return error("Choose a valid customer", 400);
    }
    if (updated.error === "invalid") {
      return error("Site name is required", 400);
    }
    return error("Site not found", 404);
  }

  await recordAccountActivity({
    tenantId: auth.tenantId,
    actor: actorFromUser(auth.user),
    action: "site.updated",
    summary: `${auth.user.email} updated site ${updated.site.name}.`,
    target: { type: "site", id: updated.site.id, label: updated.site.name },
  });
  return json({ site: updated.site });
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
  const removed = await deleteSite(id, auth.tenantId);
  if ("error" in removed) {
    if (removed.error === "has-machines") {
      return error("Move or remove machines at this site before deleting it", 409);
    }
    return error("Site not found", 404);
  }

  await recordAccountActivity({
    tenantId: auth.tenantId,
    actor: actorFromUser(auth.user),
    action: "site.deleted",
    summary: `${auth.user.email} removed site ${id}.`,
    target: { type: "site", id },
  });
  return json({ ok: true });
}

export const PATCH = withCatalogConflict(handlePATCH);
export const DELETE = withCatalogConflict(handleDELETE);
