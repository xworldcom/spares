import { requireRole, requireUser } from "@/lib/auth";
import { canAccessMachine } from "@/lib/access";
import { error, isErrorResponse, json, readJson } from "@/lib/http";
import { machineFileUrl, toMachineDetail } from "@/lib/machines";
import { getMachine, listSites, updateMachineSite } from "@/lib/store";

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

  return json(
    toMachineDetail(machine, machineFileUrl(request, machine.id), auth.user.role, sites),
  );
}

type PatchBody = {
  siteId?: unknown;
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

  const siteId =
    body.siteId === null || body.siteId === ""
      ? null
      : typeof body.siteId === "string"
        ? body.siteId
        : undefined;
  if (siteId === undefined) {
    return error("siteId is required", 400);
  }

  const updated = await updateMachineSite(id, siteId);
  if ("error" in updated) {
    if (updated.error === "bad-site") {
      return error("Choose a valid plant", 400);
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
