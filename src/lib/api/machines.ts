import {
  CLIENT_PACK_MAX_BYTES,
  MULTIPART_PACK_MAX_BYTES,
  machineBlobPathname,
  multipartTooLargeMessage,
  packOverLimitMessage,
  platform413Message,
  storedFileNameFromUploadPath,
} from "../pack-limits.ts";
import { modelContentType, modelExtension } from "../machines.ts";
import { ApiError, errorMessage, isApiError } from "./errors";
import { apiFetch } from "./client";
import type {
  MachineDetail,
  MachinesListResponse,
  MachineSummary,
  Part,
  Role,
} from "./types";

const MODEL_UPLOAD = "/api/machines/model-upload";

function normalizePart(part: Part): Part {
  return {
    id: part.id,
    name: part.name,
    meshName: part.meshName,
    qty: typeof part.qty === "number" && Number.isFinite(part.qty) ? part.qty : 1,
    ...(part.material ? { material: part.material } : {}),
    ...(part.vendor ? { vendor: part.vendor } : {}),
    ...(part.weight ? { weight: part.weight } : {}),
    ...(part.category ? { category: part.category } : {}),
    ...(part.replaces ? { replaces: part.replaces } : {}),
    ...(part.stock ? { stock: part.stock } : {}),
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
      version: machine.version,
      revisedAt: machine.revisedAt,
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
    version: machine.version,
    revisedAt: machine.revisedAt,
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

export async function updateMachineName(machineId: string, name: string) {
  const data = await apiFetch<MachineDetail>(`/api/machines/${machineId}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
  return normalizeMachine(data, "staff");
}

export async function updateMachinePart(
  machineId: string,
  part: {
    key: string;
    partNumber: string;
    name: string;
    meshName: string;
    qty: number;
  },
) {
  const data = await apiFetch<MachineDetail>(`/api/machines/${machineId}`, {
    method: "PATCH",
    body: JSON.stringify({ part }),
  });
  return normalizeMachine(data, "staff");
}

export async function deleteMachine(machineId: string) {
  await apiFetch<{ ok: true }>(`/api/machines/${machineId}`, {
    method: "DELETE",
  });
}

function assertModelSize(file: File) {
  if (file.size > CLIENT_PACK_MAX_BYTES) {
    throw new ApiError(packOverLimitMessage(file.size, CLIENT_PACK_MAX_BYTES), 413);
  }
}

async function clientModelUploadAvailable() {
  try {
    return await apiFetch<{ clientUpload: boolean; maxBytes: number }>(
      MODEL_UPLOAD,
    );
  } catch {
    return null;
  }
}

async function uploadModelToBlob(file: File) {
  const storedFileName = `${crypto.randomUUID()}${modelExtension(file.name)}`;
  const { upload } = await import("@vercel/blob/client");
  const blob = await upload(machineBlobPathname(storedFileName), file, {
    access: "private",
    handleUploadUrl: MODEL_UPLOAD,
    multipart: file.size > 4 * 1024 * 1024,
    contentType: modelContentType(file.name),
  });
  return storedFileNameFromUploadPath(blob.pathname);
}

function postPackForm(
  path: string,
  input: {
    name: string;
    partsList: File;
    siteId?: string;
    model?: File;
    storedFileName?: string;
    originalFileName?: string;
  },
) {
  const form = new FormData();
  form.set("name", input.name);
  form.set("partsList", input.partsList);
  if (input.siteId) {
    form.set("siteId", input.siteId);
  }
  if (input.storedFileName) {
    form.set("storedFileName", input.storedFileName);
    form.set("originalFileName", input.originalFileName ?? input.storedFileName);
  } else if (input.model) {
    form.set("model", input.model);
  }
  return apiFetch<MachineDetail>(path, { method: "POST", body: form });
}

async function uploadOrReplacePack(
  path: string,
  input: {
    name: string;
    model: File;
    partsList: File;
    siteId?: string;
  },
) {
  assertModelSize(input.model);

  const availability = await clientModelUploadAvailable();
  if (availability?.clientUpload) {
    try {
      const storedFileName = await uploadModelToBlob(input.model);
      const data = await postPackForm(path, {
        name: input.name,
        partsList: input.partsList,
        siteId: input.siteId,
        storedFileName,
        originalFileName: input.model.name,
      });
      return normalizeMachine(data, "staff");
    } catch (cause) {
      if (isApiError(cause)) {
        throw cause;
      }
      const message = errorMessage(
        cause,
        "Could not upload the 3D model to storage. Try again, or use a smaller GLB.",
      );
      if (/maximum|too large|size/i.test(message)) {
        throw new ApiError(
          packOverLimitMessage(input.model.size, CLIENT_PACK_MAX_BYTES),
          413,
        );
      }
      throw new ApiError(message, 0);
    }
  }

  if (input.model.size > MULTIPART_PACK_MAX_BYTES) {
    throw new ApiError(multipartTooLargeMessage(), 413);
  }

  try {
    const data = await postPackForm(path, {
      name: input.name,
      partsList: input.partsList,
      siteId: input.siteId,
      model: input.model,
    });
    return normalizeMachine(data, "staff");
  } catch (cause) {
    if (isApiError(cause) && cause.status === 413) {
      throw new ApiError(platform413Message(), 413);
    }
    throw cause;
  }
}

export async function uploadMachinePack(input: {
  name: string;
  model: File;
  partsList: File;
  siteId?: string;
}): Promise<MachineDetail> {
  return uploadOrReplacePack("/api/machines", input);
}

export async function replaceMachinePack(
  machineId: string,
  input: { name: string; model: File; partsList: File },
): Promise<MachineDetail> {
  return uploadOrReplacePack(`/api/machines/${machineId}/pack`, input);
}
