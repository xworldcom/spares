import { randomUUID } from "node:crypto";
import {
  isManualCategory,
  isManualFilename,
  MANUAL_MAX_BYTES,
  MAX_MANUAL_TITLE,
  manualContentType,
  manualExtension,
  manualOverLimitMessage,
  parseCareText,
} from "@/lib/care";
import { requireMachineAccess, requireStaffMachine } from "@/lib/care-http";
import { error, isErrorResponse, json, readJson } from "@/lib/http";
import { manualFileUrl } from "@/lib/manual-file-url";
import {
  assertManualUploadAllowed,
  manualExistsInS3,
  selectManualStoreKind,
  vercelRequiresManualObjectStorageMessage,
} from "@/lib/manual-storage";
import { createManual, listManuals } from "@/lib/store";
import type { PublicMachineManual } from "@/types";

type CreateBody = {
  title?: unknown;
  category?: unknown;
  storedFileName?: unknown;
  originalFileName?: unknown;
  sizeBytes?: unknown;
};

async function toPublic(
  request: Request,
  machineId: string,
  manuals: Awaited<ReturnType<typeof listManuals>>,
): Promise<PublicMachineManual[]> {
  return Promise.all(
    manuals.map(async (manual) => ({
      ...manual,
      fileUrl: await manualFileUrl(request, machineId, manual),
    })),
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireMachineAccess(id);
  if ("error" in access) {
    return access.error;
  }
  const manuals = await listManuals(access.machine.id);
  return json({ manuals: await toPublic(request, access.machine.id, manuals) });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireStaffMachine(id);
  if ("error" in access) {
    return access.error;
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    return createFromMultipart(request, access.machine.id, access.user.email);
  }

  const body = await readJson<CreateBody>(request);
  if (isErrorResponse(body)) {
    return body;
  }
  return createFromStoredObject(request, access.machine.id, access.user.email, body);
}

async function createFromStoredObject(
  request: Request,
  machineId: string,
  uploadedByEmail: string,
  body: CreateBody,
) {
  try {
    assertManualUploadAllowed();
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message : vercelRequiresManualObjectStorageMessage();
    return error(message, 503);
  }

  const title = parseCareText(body.title, "Title", MAX_MANUAL_TITLE);
  if (!title.ok) {
    return error(title.error, 400);
  }
  if (!isManualCategory(body.category)) {
    return error("Choose a manual category", 400);
  }
  const storedFileName =
    typeof body.storedFileName === "string" ? body.storedFileName.trim() : "";
  const originalFileName =
    typeof body.originalFileName === "string"
      ? body.originalFileName.trim()
      : storedFileName;
  if (!storedFileName || !isManualFilename(storedFileName)) {
    return error("Manual must be a PDF or Word document.", 400);
  }
  if (selectManualStoreKind() === "s3") {
    const exists = await manualExistsInS3(storedFileName);
    if (!exists) {
      return error("Upload the file to storage before saving the manual.", 400);
    }
  }

  const created = await createManual({
    machineId,
    title: title.text,
    category: body.category,
    storedFileName,
    originalFileName,
    contentType: manualContentType(originalFileName || storedFileName),
    sizeBytes: typeof body.sizeBytes === "number" ? body.sizeBytes : undefined,
    uploadedByEmail,
  });
  if ("error" in created) {
    return error("Machine not found", 404);
  }
  return json(
    {
      manual: {
        ...created.manual,
        fileUrl: await manualFileUrl(request, machineId, created.manual),
      },
    },
    201,
  );
}

async function createFromMultipart(
  request: Request,
  machineId: string,
  uploadedByEmail: string,
) {
  if (process.env.VERCEL) {
    return error(vercelRequiresManualObjectStorageMessage(), 503);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return error("Expected multipart/form-data", 400);
  }

  const title = parseCareText(form.get("title"), "Title", MAX_MANUAL_TITLE);
  if (!title.ok) {
    return error(title.error, 400);
  }
  const category = form.get("category");
  if (!isManualCategory(category)) {
    return error("Choose a manual category", 400);
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return error("A PDF or Word document is required", 400);
  }
  if (!isManualFilename(file.name)) {
    return error("Manual must be a PDF or Word document.", 400);
  }
  if (file.size > MANUAL_MAX_BYTES) {
    return error(manualOverLimitMessage(file.size), 413);
  }

  const storedFileName = `${randomUUID()}${manualExtension(file.name)}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const created = await createManual({
    machineId,
    title: title.text,
    category,
    storedFileName,
    originalFileName: file.name,
    contentType: file.type || manualContentType(file.name),
    sizeBytes: file.size,
    uploadedByEmail,
    bytes,
  });
  if ("error" in created) {
    return error("Machine not found", 404);
  }
  return json(
    {
      manual: {
        ...created.manual,
        fileUrl: await manualFileUrl(request, machineId, created.manual),
      },
    },
    201,
  );
}
