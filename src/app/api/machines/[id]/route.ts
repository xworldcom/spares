import { requireTenantStaff, requireTenantUser } from "@/lib/auth/tenant-scope";
import { canAccessMachine } from "@/lib/access";
import { error, isErrorResponse, json, readJson } from "@/lib/http";
import { machineFileUrl } from "@/lib/machine-file-url";
import { toMachineDetail } from "@/lib/machines";
import { parseStaffPartEdit, type StaffPartEdit } from "@/lib/staff-catalog";
import {
  deleteMachine,
  getMachine,
  getOrgContext,
  recordMachineView,
  updateMachine,
} from "@/lib/store";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireTenantUser();
  if ("error" in auth) {
    return auth.error;
  }

  const { id } = await params;
  const [machine, org] = await Promise.all([
    getMachine(id, auth.tenantId),
    getOrgContext(auth.tenantId),
  ]);
  if (!machine || !canAccessMachine(auth.user, machine, org.sites, org.customers)) {
    return error("Machine not found", 404);
  }

  if (auth.user.role === "customer") {
    void recordMachineView({
      userId: auth.user.id,
      email: auth.user.email,
      machineId: machine.id,
      tenantId: auth.tenantId,
    });
  }

  return json(
    toMachineDetail(
      machine,
      await machineFileUrl(request, machine),
      auth.user.role,
      org.sites,
      org.customers,
    ),
  );
}

type PatchBody = {
  siteId?: unknown;
  name?: unknown;
  part?: unknown;
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

  const hasSiteId = "siteId" in body;
  const hasName = "name" in body;
  const hasPart = "part" in body;
  if (!hasSiteId && !hasName && !hasPart) {
    return error("Send a name, plant, or part to update", 400);
  }

  const patch: { name?: string; siteId?: string | null; part?: StaffPartEdit } = {};
  if (hasSiteId) {
    patch.siteId =
      body.siteId === null || body.siteId === ""
        ? null
        : typeof body.siteId === "string"
          ? body.siteId
          : undefined;
    if (patch.siteId === undefined) {
      return error("Choose a valid plant", 400);
    }
  }
  if (hasName) {
    if (typeof body.name !== "string") {
      return error("Enter a machine name", 400);
    }
    patch.name = body.name;
  }
  if (hasPart) {
    const parsed = parseStaffPartEdit(body.part);
    if ("error" in parsed) {
      return error(parsed.error, 400);
    }
    patch.part = parsed;
  }

  const updated = await updateMachine(id, auth.tenantId, patch);
  if ("error" in updated) {
    if (updated.error === "bad-site") {
      return error("Choose a valid plant", 400);
    }
    if (updated.error === "bad-name") {
      return error("Enter a machine name", 400);
    }
    if (updated.error === "bad-part") {
      return error(updated.message, 400);
    }
    return error("Machine not found", 404);
  }

  const org = await getOrgContext(auth.tenantId);
  return json(
    toMachineDetail(
      updated.machine,
      await machineFileUrl(request, updated.machine),
      auth.user.role,
      org.sites,
      org.customers,
    ),
  );
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
  const deleted = await deleteMachine(id, auth.tenantId);
  if ("error" in deleted) {
    return error("Machine not found", 404);
  }

  return json({ ok: true });
}
