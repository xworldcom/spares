import { requireRole } from "@/lib/auth";
import { error, isErrorResponse, json, readJson } from "@/lib/http";
import { deleteSite, updateSite } from "@/lib/store";

export const dynamic = "force-dynamic";

type PatchBody = {
  name?: unknown;
  customerId?: unknown;
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

  const updated = await updateSite(id, patch);
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
  return json({ site: updated.site });
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
  const removed = await deleteSite(id);
  if ("error" in removed) {
    if (removed.error === "has-machines") {
      return error("Move or remove machines at this site before deleting it", 409);
    }
    return error("Site not found", 404);
  }
  return json({ ok: true });
}
