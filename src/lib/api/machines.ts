import {
  CLIENT_PACK_MAX_BYTES,
  machineBlobPathname,
  packOverLimitMessage,
  platform413Message,
  storedFileNameFromUploadPath,
} from "../pack-limits.ts";
import { modelContentType, modelExtension } from "../machines.ts";
import {
  modelUploadTicketFailedMessage,
  resolveModelUploadStrategy,
  type ModelUploadAvailability,
} from "../model-upload-policy.ts";
import { ApiError, errorMessage, isApiError } from "./errors";
import { apiFetch } from "./client";
import { normalizePart } from "./normalize-part";
import { invalidateWarmRead, readIfWarm, warmRead } from "./warm-read";
import type {
  MachineDetail,
  MachinesListResponse,
  MachineSummary,
  Part,
  Role,
} from "./types";

const MODEL_UPLOAD = "/api/machines/model-upload";

/**
 * Same-origin API path for PartPicker when object storage CDN is not configured.
 */
export function machineFileSrc(machineId: string) {
  return `/api/machines/${machineId}/file`;
}

function resolvedFileUrl(machine: MachineDetail) {
  if (machine.hasModel === false || !machine.fileUrl.trim()) {
    return "";
  }
  if (machine.fileUrl.startsWith("http://") || machine.fileUrl.startsWith("https://")) {
    return machine.fileUrl;
  }
  return machineFileSrc(machine.id);
}

export function normalizeMachine(
  machine: MachineDetail,
  role?: Role,
): MachineDetail {
  const parts = Array.isArray(machine.parts)
    ? machine.parts.map(normalizePart)
    : [];
  const fileUrl = resolvedFileUrl(machine);

  if (role === "customer") {
    return {
      id: machine.id,
      name: machine.name,
      fileUrl,
      parts,
      siteId: machine.siteId,
      company: machine.company,
      siteName: machine.siteName,
      version: machine.version,
      revisedAt: machine.revisedAt,
      hasModel: machine.hasModel === false ? false : Boolean(fileUrl),
      ...(machine.oem ? { oem: machine.oem } : {}),
      ...(machine.notes ? { notes: machine.notes } : {}),
    };
  }

  const detail: MachineDetail = {
    id: machine.id,
    name: machine.name,
    fileUrl,
    parts,
    siteId: machine.siteId,
    company: machine.company,
    siteName: machine.siteName,
    version: machine.version,
    revisedAt: machine.revisedAt,
    hasModel: machine.hasModel === false ? false : Boolean(fileUrl),
    ...(machine.oem ? { oem: machine.oem } : {}),
    ...(machine.notes ? { notes: machine.notes } : {}),
  };
  if (Array.isArray(machine.unmatched)) {
    detail.unmatched = machine.unmatched;
  }
  return detail;
}

export async function listMachines(options?: {
  heal?: boolean;
  fresh?: boolean;
}): Promise<MachineSummary[]> {
  const heal = options?.heal ?? false;
  const path = heal ? "/api/machines?heal=1" : "/api/machines";
  const cacheKey = heal ? "machines:list:heal" : "care-hub:machines";
  if (options?.fresh) {
    invalidateWarmRead(cacheKey);
  }
  return readIfWarm(cacheKey, async () => {
    const data = await apiFetch<MachinesListResponse>(path);
    return data.machines ?? [];
  });
}

function machineWarmKey(id: string) {
  return `machine:${id}`;
}

export async function getMachine(
  id: string,
  role?: Role,
): Promise<MachineDetail> {
  return readIfWarm(machineWarmKey(id), async () => {
    const data = await apiFetch<MachineDetail>(`/api/machines/${id}`);
    return normalizeMachine(data, role);
  });
}

export function warmMachineName(machineId: string, role?: Role) {
  warmRead(machineWarmKey(machineId), () => getMachine(machineId, role));
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

export async function createModelLessMachine(input: {
  name: string;
  siteId: string;
  oem?: string;
  notes?: string;
}): Promise<MachineDetail> {
  const data = await apiFetch<MachineDetail>("/api/machines", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      siteId: input.siteId,
      ...(input.oem ? { oem: input.oem } : {}),
      ...(input.notes ? { notes: input.notes } : {}),
    }),
  });
  return normalizeMachine(data);
}

function assertModelSize(file: File) {
  if (file.size > CLIENT_PACK_MAX_BYTES) {
    throw new ApiError(packOverLimitMessage(file.size, CLIENT_PACK_MAX_BYTES), 413);
  }
}

async function clientModelUploadAvailable(): Promise<ModelUploadAvailability | null> {
  try {
    return await apiFetch<ModelUploadAvailability>(MODEL_UPLOAD);
  } catch {
    return null;
  }
}

async function uploadModelToS3(file: File) {
  const ticket = await apiFetch<{
    uploadUrl: string;
    storedFileName: string;
    method?: string;
  }>(MODEL_UPLOAD, {
    method: "POST",
    body: JSON.stringify({ originalFileName: file.name }),
  });
  const response = await fetch(ticket.uploadUrl, {
    method: ticket.method ?? "PUT",
    body: file,
    headers: { "Content-Type": modelContentType(file.name) },
  });
  if (!response.ok) {
    throw new Error(`Could not upload the 3D model to storage (${response.status}).`);
  }
  return ticket.storedFileName;
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
  const strategy = resolveModelUploadStrategy(availability, input.model.size);
  if (strategy.mode === "refuse") {
    throw new ApiError(strategy.message, strategy.status);
  }

  if (strategy.mode === "s3") {
    try {
      const storedFileName = await uploadModelToS3(input.model);
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
      throw new ApiError(
        errorMessage(cause, modelUploadTicketFailedMessage()),
        0,
      );
    }
  }

  if (strategy.mode === "blob") {
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
