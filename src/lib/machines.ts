import type { CustomerAccount, MachineDetail, MachineSummary, Role, Site } from "../types/index.ts";
import { siteCompanyName } from "./org.ts";
import type { StoredMachine } from "./store.ts";

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
  machine: { id: string; name: string; siteId?: string },
  sites: readonly Site[] = [],
  accounts: readonly CustomerAccount[] = [],
): MachineSummary {
  return {
    id: machine.id,
    name: machine.name,
    ...siteFields(machine, sites, accounts),
  };
}

export function toMachineDetail(
  machine: StoredMachine,
  fileUrl: string,
  role: Role,
  sites: readonly Site[] = [],
  accounts: readonly CustomerAccount[] = [],
): MachineDetail {
  const located = siteFields(machine, sites, accounts);
  if (role === "staff") {
    return {
      id: machine.id,
      name: machine.name,
      fileUrl,
      parts: machine.parts,
      unmatched: machine.unmatched,
      version: machine.version ?? 1,
      revisedAt: machine.revisedAt,
      ...located,
    };
  }

  return {
    id: machine.id,
    name: machine.name,
    fileUrl,
    parts: machine.parts,
    version: machine.version ?? 1,
    revisedAt: machine.revisedAt,
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
