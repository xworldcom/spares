import type { MachineDetail, Role } from "@/types";
import type { StoredMachine } from "@/lib/store";

export function machineFileUrl(request: Request, machineId: string) {
  return new URL(`/api/machines/${machineId}/file`, request.url).toString();
}

export function toMachineDetail(
  machine: StoredMachine,
  fileUrl: string,
  role: Role,
): MachineDetail {
  const detail: MachineDetail = {
    id: machine.id,
    name: machine.name,
    fileUrl,
    parts: machine.parts,
  };
  if (role === "staff") {
    detail.unmatched = machine.unmatched;
  }
  return detail;
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
