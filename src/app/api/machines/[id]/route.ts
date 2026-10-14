import { requireTenantStaff, requireTenantUser } from "@/lib/auth/tenant-scope";
import { canAccessMachine } from "@/lib/access";
import { error, isErrorResponse, json, readJson, withCatalogConflict } from "@/lib/http";
import { machineFileUrl } from "@/lib/machine-file-url";
import { toMachineDetail } from "@/lib/machines";
import { parseManualSubPartMutation } from "@/lib/manual-sub-assembly";
import { parseStaffPartEdit, type StaffPartEdit } from "@/lib/staff-catalog";
import type { ManualSubPartMutation } from "@/lib/manual-sub-assembly";
import { actorFromUser, recordAccountActivity } from "@/lib/activity-log";
import {
  deleteMachine,
  getMachine,
  getOrgContext,
  listPartLifecycleRows,
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
  const [machine, org, lifecycleRows] = await Promise.all([
    getMachine(id, auth.tenantId),
    getOrgContext(auth.tenantId),
    listPartLifecycleRows(),
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
      lifecycleRows,
    ),
  );
}

type PatchBody = {
  siteId?: unknown;
  name?: unknown;
  part?: unknown;
  manualSubPart?: unknown;
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

  const hasSiteId = "siteId" in body;
  const hasName = "name" in body;
  const hasPart = "part" in body;
  const hasManualSubPart = "manualSubPart" in body;
  if (!hasSiteId && !hasName && !hasPart && !hasManualSubPart) {
    return error("Send a name, plant, part, or manual sub-part change", 400);
  }

  const patch: {
    name?: string;
    siteId?: string | null;
    part?: StaffPartEdit;
    manualSubPart?: ManualSubPartMutation;
  } = {};
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
  if (hasManualSubPart) {
    const parsed = parseManualSubPartMutation(body.manualSubPart);
    if ("error" in parsed) {
      return error(parsed.error, 400);
    }
    patch.manualSubPart = parsed;
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
    if (updated.error === "bad-manual-sub") {
      const status =
        updated.message.includes("Refresh") || updated.message.includes("Someone else")
          ? 409
          : 400;
      return error(updated.message, status);
    }
    return error("Machine not found", 404);
  }

  await recordAccountActivity({
    tenantId: auth.tenantId,
    actor: actorFromUser(auth.user),
    action: "machine.updated",
    summary: `${auth.user.email} updated machine ${updated.machine.name}.`,
    target: { type: "machine", id: updated.machine.id, label: updated.machine.name },
  });

  const [org, lifecycleRows] = await Promise.all([
    getOrgContext(auth.tenantId),
    listPartLifecycleRows(),
  ]);
  return json(
    toMachineDetail(
      updated.machine,
      await machineFileUrl(request, updated.machine),
      auth.user.role,
      org.sites,
      org.customers,
      lifecycleRows,
    ),
  );
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
  const deleted = await deleteMachine(id, auth.tenantId);
  if ("error" in deleted) {
    return error("Machine not found", 404);
  }

  await recordAccountActivity({
    tenantId: auth.tenantId,
    actor: actorFromUser(auth.user),
    action: "machine.deleted",
    summary: `${auth.user.email} removed machine ${id}.`,
    target: { type: "machine", id },
  });

  return json({ ok: true });
}

export const PATCH = withCatalogConflict(handlePATCH);
export const DELETE = withCatalogConflict(handleDELETE);
