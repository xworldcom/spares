import { randomUUID } from "node:crypto";
import { extractMeshNames } from "./gltf.ts";
import {
  CLIENT_PACK_MAX_BYTES,
  PARTS_LIST_MAX_BYTES,
  packOverLimitMessage,
  storedFileNameFromUploadPath,
} from "./pack-limits.ts";
import { refuseMultipartModelInForm } from "./model-upload-policy.ts";
import { joinParts, parsePartsList } from "./parts.ts";
import { isModelFilename, modelExtension } from "./machines.ts";
import { modelExistsInS3, selectModelStoreKind } from "./model-storage.ts";
import { readStoredModelAfterUpload } from "./read-stored-model.ts";

export type PackFormSuccess = {
  name: string;
  originalFileName: string;
  storedFileName: string;
  alreadyStored: boolean;
  modelBytes: Buffer;
  partsText: string;
  partsListName: string;
  siteId?: string;
};

export type PackFormError = {
  error: string;
  status: number;
};

export function isPackFormError(
  value: PackFormSuccess | PackFormError,
): value is PackFormError {
  return "status" in value;
}

export async function readPackForm(
  form: FormData,
  options?: { nameRequired?: boolean; existingName?: string },
): Promise<PackFormSuccess | PackFormError> {
  const nameValue = form.get("name");
  const name = typeof nameValue === "string" ? nameValue.trim() : "";
  if (options?.nameRequired !== false && !name) {
    return { error: "Machine name is required", status: 400 };
  }

  const partsList = form.get("partsList");
  if (!(partsList instanceof File) || partsList.size === 0) {
    return { error: "A parts list CSV or JSON file is required", status: 400 };
  }
  if (partsList.size > PARTS_LIST_MAX_BYTES) {
    return {
      error: "That parts list is too large. Use a CSV or JSON under 5 MB.",
      status: 400,
    };
  }

  const storedRef = form.get("storedFileName");
  const originalRef = form.get("originalFileName");
  const model = form.get("model");

  let storedFileName: string;
  let originalFileName: string;
  let modelBytes: Buffer;
  let alreadyStored = false;

  if (typeof storedRef === "string" && storedRef.trim()) {
    try {
      storedFileName = storedFileNameFromUploadPath(storedRef.trim());
    } catch {
      return { error: "Invalid stored file name", status: 400 };
    }
    originalFileName =
      typeof originalRef === "string" && originalRef.trim()
        ? originalRef.trim()
        : storedFileName;
    if (!isModelFilename(originalFileName) && !isModelFilename(storedFileName)) {
      return { error: "Model must be a .glb or .gltf file", status: 400 };
    }
    if (selectModelStoreKind() === "s3") {
      if (!(await modelExistsInS3(storedFileName))) {
        return {
          error:
            "The uploaded model was not found in storage. Try uploading the pack again.",
          status: 400,
        };
      }
      alreadyStored = true;
    }
    const bytes = await readStoredModelAfterUpload(storedFileName);
    if (!bytes) {
      return {
        error:
          "The uploaded model was not found in storage. Try uploading the pack again.",
        status: 400,
      };
    }
    modelBytes = bytes;
    alreadyStored = true;
  } else if (model instanceof File && model.size > 0) {
    if (!isModelFilename(model.name)) {
      return { error: "Model must be a .glb or .gltf file", status: 400 };
    }
    const multipartRefused = refuseMultipartModelInForm(model.size);
    if (multipartRefused) {
      return multipartRefused;
    }
    if (model.size > CLIENT_PACK_MAX_BYTES) {
      return {
        error: packOverLimitMessage(model.size, CLIENT_PACK_MAX_BYTES),
        status: 413,
      };
    }
    storedFileName = `${randomUUID()}${modelExtension(model.name)}`;
    originalFileName = model.name;
    modelBytes = Buffer.from(await model.arrayBuffer());
  } else {
    return { error: "A GLB or GLTF model file is required", status: 400 };
  }

  const siteValue = form.get("siteId");
  const siteId =
    typeof siteValue === "string" && siteValue.trim()
      ? siteValue.trim()
      : undefined;

  return {
    name: name || options?.existingName || "",
    originalFileName,
    storedFileName,
    alreadyStored,
    modelBytes,
    partsText: await partsList.text(),
    partsListName: partsList.name,
    siteId,
  };
}

export function joinPackFiles(input: {
  modelBytes: Buffer;
  modelFileName: string;
  partsText: string;
  partsListName: string;
}) {
  let listRows;
  try {
    listRows = parsePartsList(input.partsText, input.partsListName);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Invalid parts list";
    return { error: message, status: 400 } satisfies PackFormError;
  }

  let meshNames: string[];
  try {
    meshNames = extractMeshNames(input.modelBytes, input.modelFileName);
  } catch (cause) {
    const message =
      cause instanceof Error
        ? cause.message
        : "Could not read mesh names from the 3D file";
    return { error: message, status: 400 } satisfies PackFormError;
  }

  return joinParts(listRows, meshNames);
}
