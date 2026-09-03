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
 * Same-origin model file. Loaders must send the login cookie
 * (`credentials: "include"`). This is the `src` for PartPicker —
 * not a public blob URL.
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
    };
  }

  const detail: MachineDetail = {
    id: machine.id,
    name: machine.name,
    fileUrl: machineFileSrc(machine.id),
    parts,
  };
  if (Array.isArray(machine.unmatched)) {
    detail.unmatched = machine.unmatched;
  }
  return detail;
}

export async function listMachines(): Promise<MachineSummary[]> {
  const data = await apiFetch<MachinesListResponse>("/api/machines");
  return data.machines ?? [];
}

export async function getMachine(
  id: string,
  role?: Role,
): Promise<MachineDetail> {
  const data = await apiFetch<MachineDetail>(`/api/machines/${id}`);
  return normalizeMachine(data, role);
}

export async function uploadMachinePack(input: {
  name: string;
  model: File;
  partsList: File;
}): Promise<MachineDetail> {
  const form = new FormData();
  form.set("name", input.name);
  form.set("model", input.model);
  form.set("partsList", input.partsList);

  const data = await apiFetch<MachineDetail>("/api/machines", {
    method: "POST",
    body: form,
  });
  return normalizeMachine(data, "staff");
}
