import { apiFetch } from "./client";
import type {
  MachineDetail,
  MachinesListResponse,
  MachineSummary,
  Part,
  Role,
} from "./types";

function normalizePart(part: Part): Part {
  return {
    id: part.id,
    name: part.name,
    meshName: part.meshName,
    qty: typeof part.qty === "number" && Number.isFinite(part.qty) ? part.qty : 1,
  };
}

/**
 * Same-origin path for PartPicker `src`.
 * Pass this path through as-is. Do not pre-fetch into a blob URL;
 * PartPicker’s loader sends the login cookie on this `src`.
 */
export function machineFileSrc(machineId: string) {
  return `/api/machines/${machineId}/file`;
}

export function normalizeMachine(
  machine: MachineDetail,
  role?: Role,
): MachineDetail {
  const parts = Array.isArray(machine.parts)
    ? machine.parts.map(normalizePart)
    : [];

  if (role === "customer") {
    return {
      id: machine.id,
      name: machine.name,
      fileUrl: machineFileSrc(machine.id),
      parts,
      siteId: machine.siteId,
      company: machine.company,
      siteName: machine.siteName,
    };
  }

  const detail: MachineDetail = {
    id: machine.id,
    name: machine.name,
    fileUrl: machineFileSrc(machine.id),
    parts,
    siteId: machine.siteId,
    company: machine.company,
    siteName: machine.siteName,
  };
  if (Array.isArray(machine.unmatched)) {
    detail.unmatched = machine.unmatched;
  }
  return detail;
}

export async function listMachines(options?: {
  heal?: boolean;
}): Promise<MachineSummary[]> {
  const path = options?.heal ? "/api/machines?heal=1" : "/api/machines";
  const data = await apiFetch<MachinesListResponse>(path);
  return data.machines ?? [];
}

export async function getMachine(
  id: string,
  role?: Role,
): Promise<MachineDetail> {
  const data = await apiFetch<MachineDetail>(`/api/machines/${id}`);
  return normalizeMachine(data, role);
}

export async function updateMachineSite(machineId: string, siteId: string | null) {
  const data = await apiFetch<MachineDetail>(`/api/machines/${machineId}`, {
    method: "PATCH",
    body: JSON.stringify({ siteId }),
  });
  return normalizeMachine(data, "staff");
}

export async function uploadMachinePack(input: {
  name: string;
  model: File;
  partsList: File;
  siteId?: string;
}): Promise<MachineDetail> {
  const form = new FormData();
  form.set("name", input.name);
  form.set("model", input.model);
  form.set("partsList", input.partsList);
  if (input.siteId) {
    form.set("siteId", input.siteId);
  }

  const data = await apiFetch<MachineDetail>("/api/machines", {
    method: "POST",
    body: form,
  });
  return normalizeMachine(data, "staff");
}
