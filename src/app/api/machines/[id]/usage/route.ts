import {
  MAX_USAGE_NOTES,
  parseOptionalCareText,
  parseOptionalDate,
  parseOptionalNumber,
} from "@/lib/care";
import { requireStaffMachine } from "@/lib/care-http";
import { error, isErrorResponse, json, readJson } from "@/lib/http";
import { userTenantId } from "@/lib/tenant";
import { getMachineUsage, updateMachineUsage } from "@/lib/store";

type PatchBody = {
  hours?: unknown;
  cycles?: unknown;
  lastServiceAt?: unknown;
  notes?: unknown;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireStaffMachine(id);
  if ("error" in access) {
    return access.error;
  }
  const tenantId = userTenantId(access.user);
  return json({ usage: await getMachineUsage(access.machine.id, tenantId) });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireStaffMachine(id);
  if ("error" in access) {
    return access.error;
  }

  const body = await readJson<PatchBody>(request);
  if (isErrorResponse(body)) {
    return body;
  }

  const patch: {
    hours?: number | null;
    cycles?: number | null;
    lastServiceAt?: string | null;
    notes?: string | null;
  } = {};

  if ("hours" in body) {
    const hours = parseOptionalNumber(body.hours, "Hours");
    if (!hours.ok) {
      return error(hours.error, 400);
    }
    patch.hours = hours.value ?? null;
  }
  if ("cycles" in body) {
    const cycles = parseOptionalNumber(body.cycles, "Cycles");
    if (!cycles.ok) {
      return error(cycles.error, 400);
    }
    patch.cycles = cycles.value ?? null;
  }
  if ("lastServiceAt" in body) {
    const lastServiceAt = parseOptionalDate(body.lastServiceAt, "Last service");
    if (!lastServiceAt.ok) {
      return error(lastServiceAt.error, 400);
    }
    patch.lastServiceAt = lastServiceAt.value ?? null;
  }
  if ("notes" in body) {
    const notes = parseOptionalCareText(body.notes, "Notes", MAX_USAGE_NOTES);
    if (!notes.ok) {
      return error(notes.error, 400);
    }
    patch.notes = notes.text ?? null;
  }

  const tenantId = userTenantId(access.user);
  const updated = await updateMachineUsage(
    access.machine.id,
    tenantId,
    patch,
    access.user.email,
  );
  if ("error" in updated) {
    return error("Machine not found", 404);
  }
  return json({ usage: updated.usage });
}
