import type { CustomerAccount, MachineDetail, MachineSummary, Role, Site } from "../types/index.ts";
import { siteCompanyName } from "./org.ts";
import type { StoredMachine } from "./store.ts";

export const MAX_MACHINE_NAME = 120;
export const MAX_MACHINE_OEM = 80;
export const MAX_MACHINE_NOTES = 400;

export function normalizeMachineName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

export function machineNameKey(name: string) {
  return normalizeMachineName(name).toLowerCase();
}

export function machineHasModel(machine: {
  storedFileName?: string | null;
  hasModel?: boolean;
}) {
  if (typeof machine.hasModel === "boolean") {
    return machine.hasModel;
  }
  return Boolean(machine.storedFileName?.trim());
}

export function findMachineByNameAtSite<
  T extends { name: string; siteId?: string },
>(machines: readonly T[], name: string, siteId: string): T | null {
  const key = machineNameKey(name);
  if (!key || !siteId) {
    return null;
  }
  return (
    machines.find(
      (row) => row.siteId === siteId && machineNameKey(row.name) === key,
    ) ?? null
  );
}

export function siteFields(
  machine: { siteId?: string },
  sites: readonly Site[] = [],
  accounts: readonly CustomerAccount[] = [],
) {
  const site = sites.find((row) => row.id === machine.siteId);
  if (!site) {
    return machine.siteId ? { siteId: machine.siteId } : {};
  }
  return {
    siteId: site.id,
    company: siteCompanyName(site, accounts),
    siteName: site.name,
  };
}

export function toMachineSummary(
  machine: {
    id: string;
    name: string;
    siteId?: string;
    storedFileName?: string;
    hasModel?: boolean;
    version?: number;
  },
  sites: readonly Site[] = [],
  accounts: readonly CustomerAccount[] = [],
): MachineSummary {
  return {
    id: machine.id,
    name: machine.name,
    hasModel: machineHasModel(machine),
    version: machine.version ?? 1,
    ...siteFields(machine, sites, accounts),
  };
}

function optionalMachineCopy(machine: StoredMachine): Pick<MachineDetail, "oem" | "notes"> {
  const copy: Pick<MachineDetail, "oem" | "notes"> = {};
  if (machine.oem?.trim()) {
    copy.oem = machine.oem.trim();
  }
  if (machine.notes?.trim()) {
    copy.notes = machine.notes.trim();
  }
  return copy;
}

export function toMachineDetail(
  machine: StoredMachine,
  fileUrl: string,
  role: Role,
  sites: readonly Site[] = [],
  accounts: readonly CustomerAccount[] = [],
): MachineDetail {
  const located = siteFields(machine, sites, accounts);
  const hasModel = machineHasModel(machine);
  const resolvedUrl = hasModel ? fileUrl : "";
  const extra = optionalMachineCopy(machine);
  if (role === "staff") {
    return {
      id: machine.id,
      name: machine.name,
      fileUrl: resolvedUrl,
      parts: machine.parts,
      unmatched: machine.unmatched,
      version: machine.version ?? 1,
      revisedAt: machine.revisedAt,
      hasModel,
      ...extra,
      ...located,
    };
  }

  return {
    id: machine.id,
    name: machine.name,
    fileUrl: resolvedUrl,
    parts: machine.parts,
    version: machine.version ?? 1,
    revisedAt: machine.revisedAt,
    hasModel,
    ...extra,
    ...located,
  };
}

export function modelContentType(filename: string) {
  return filename.toLowerCase().endsWith(".gltf")
    ? "model/gltf+json"
    : "model/gltf-binary";
}

export function isModelFilename(filename: string) {
  const lower = filename.toLowerCase();
  return lower.endsWith(".glb") || lower.endsWith(".gltf");
}

export function modelExtension(filename: string) {
  return filename.toLowerCase().endsWith(".gltf") ? ".gltf" : ".glb";
}
