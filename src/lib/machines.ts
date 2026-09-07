import type { MachineDetail, MachineSummary, Role, Site } from "../types/index.ts";
import type { StoredMachine } from "./store.ts";
import { modelPublicUrl } from "./model-url.ts";

export function machineFileUrl(
  request: Request,
  machine: Pick<StoredMachine, "id" | "storedFileName">,
) {
  const publicUrl = modelPublicUrl(machine.storedFileName);
  if (publicUrl) {
    return publicUrl;
  }
  return new URL(`/api/machines/${machine.id}/file`, request.url).toString();
}

export function siteFields(
  machine: { siteId?: string },
  sites: readonly Site[] = [],
) {
  const site = sites.find((row) => row.id === machine.siteId);
  if (!site) {
    return machine.siteId ? { siteId: machine.siteId } : {};
  }
  return {
    siteId: site.id,
    company: site.company,
    siteName: site.name,
  };
}

export function toMachineSummary(
  machine: { id: string; name: string; siteId?: string },
  sites: readonly Site[] = [],
): MachineSummary {
  return {
    id: machine.id,
    name: machine.name,
    ...siteFields(machine, sites),
  };
}

export function toMachineDetail(
  machine: StoredMachine,
  fileUrl: string,
  role: Role,
  sites: readonly Site[] = [],
): MachineDetail {
  const located = siteFields(machine, sites);
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
