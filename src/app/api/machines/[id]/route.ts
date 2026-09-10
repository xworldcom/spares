import { requireRole, requireUser } from "@/lib/auth";
import { canAccessMachine } from "@/lib/access";
import { error, isErrorResponse, json, readJson } from "@/lib/http";
import { machineFileUrl, toMachineDetail } from "@/lib/machines";
import { parseStaffPartEdit, type StaffPartEdit } from "@/lib/staff-catalog";
import {
  deleteMachine,
  getMachine,
  listSites,
  recordMachineView,
  updateMachine,
} from "@/lib/store";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if ("error" in auth) {
    return auth.error;
  }

  const { id } = await params;
  const [machine, sites] = await Promise.all([getMachine(id), listSites()]);
  if (!machine || !canAccessMachine(auth.user, machine, sites)) {
    return error("Machine not found", 404);
  }

  if (auth.user.role === "customer") {
    void recordMachineView({
      userId: auth.user.id,
      email: auth.user.email,
      machineId: machine.id,
    });
  }

  return json(
    toMachineDetail(machine, machineFileUrl(request, machine.id), auth.user.role, sites),
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
  const auth = await requireRole("staff");
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

  const updated = await updateMachine(id, patch);
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

  return json(
    toMachineDetail(
      updated.machine,
      machineFileUrl(request, updated.machine.id),
      auth.user.role,
      await listSites(),
    ),
  );
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
  const deleted = await deleteMachine(id);
  if ("error" in deleted) {
    return error("Machine not found", 404);
  }

  return json({ ok: true });
}
