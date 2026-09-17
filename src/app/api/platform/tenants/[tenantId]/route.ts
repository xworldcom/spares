import { requirePlatformOwner } from "@/lib/auth/tenant-scope";
import { error, isErrorResponse, json, readJson } from "@/lib/http";
import { updateTenantPlatformMeta, removePlatformTenant } from "@/lib/store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ tenantId: string }> };

type PatchBody = {
  name?: unknown;
  inactive?: unknown;
};

export async function PATCH(request: Request, context: Params) {
  const auth = await requirePlatformOwner();
  if ("error" in auth) {
    return auth.error;
  }
  const { tenantId } = await context.params;
  const body = await readJson<PatchBody>(request);
  if (isErrorResponse(body)) {
    return body;
  }

  const name = typeof body.name === "string" ? body.name : undefined;
  const inactive =
    typeof body.inactive === "boolean" ? body.inactive : undefined;

  if (name === undefined && inactive === undefined) {
    return error("No changes requested", 400);
  }

  const updated = await updateTenantPlatformMeta(tenantId, { name, inactive });
  if ("error" in updated) {
    if (updated.error === "not-found") {
      return error("Tenant not found", 404);
    }
    if (updated.error === "taken") {
      return error("A tenant with that name already exists", 409);
    }
    if (updated.error === "host-immutable") {
      return error("The Soft Launch host cannot be suspended", 400);
    }
    return error("Invalid tenant name", 400);
  }
  return json({ tenant: updated.tenant });
}

export async function DELETE(_request: Request, context: Params) {
  const auth = await requirePlatformOwner();
  if ("error" in auth) {
    return auth.error;
  }
  const { tenantId } = await context.params;
  const removed = await removePlatformTenant(tenantId);
  if ("error" in removed) {
    if (removed.error === "not-found") {
      return error("Tenant not found", 404);
    }
    if (removed.error === "host-immutable") {
      return error("The Soft Launch host cannot be deleted", 400);
    }
    if (removed.error === "has-children") {
      return error(
        "Remove all staff, customers, sites, machines, and open work on this host before deleting it",
        409,
      );
    }
    return error("Could not delete host", 400);
  }
  return json({ ok: true });
}
