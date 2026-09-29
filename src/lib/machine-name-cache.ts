export type MachineNameSeed = {
  id: string;
  name: string;
};

const memory = new Map<string, string>();

function storageKey(machineId: string) {
  return `spares-machine-name:${machineId}`;
}

export function rememberMachineName(machineId: string, name: string) {
  const trimmed = name.trim();
  if (!machineId || !trimmed) {
    return;
  }
  memory.set(machineId, trimmed);
  if (typeof sessionStorage === "undefined") {
    return;
  }
  try {
    sessionStorage.setItem(storageKey(machineId), trimmed);
  } catch {
    // Best-effort.
  }
}

export function readMachineNameCache(machineId: string): string | null {
  const hit = memory.get(machineId);
  if (hit) {
    return hit;
  }
  if (typeof sessionStorage === "undefined") {
    return null;
  }
  try {
    const stored = sessionStorage.getItem(storageKey(machineId))?.trim();
    if (stored) {
      memory.set(machineId, stored);
      return stored;
    }
  } catch {
    // Best-effort.
  }
  return null;
}

export function seedMachineName(machineId: string, name: string) {
  rememberMachineName(machineId, name);
}
