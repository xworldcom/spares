import { apiFetch } from "./client";
import type {
  MachineDetail,
  MachinesListResponse,
  MachineSummary,
  Part,
} from "./types";

function normalizePart(part: Part): Part {
  return {
    id: part.id,
    name: part.name,
    meshName: part.meshName,
    qty: typeof part.qty === "number" ? part.qty : undefined,
  };
}

function normalizeMachine(machine: MachineDetail): MachineDetail {
  return {
    ...machine,
    parts: Array.isArray(machine.parts) ? machine.parts.map(normalizePart) : [],
    unmatched: Array.isArray(machine.unmatched) ? machine.unmatched : undefined,
  };
}

export async function listMachines(): Promise<MachineSummary[]> {
  const data = await apiFetch<MachinesListResponse>("/api/machines");
  return data.machines ?? [];
}

export async function getMachine(id: string): Promise<MachineDetail> {
  const data = await apiFetch<MachineDetail>(`/api/machines/${id}`);
  return normalizeMachine(data);
}

export function machineFilePath(machineId: string) {
  return `/api/machines/${machineId}/file`;
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
  return normalizeMachine(data);
}
