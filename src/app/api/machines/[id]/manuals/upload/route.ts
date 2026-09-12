import { randomUUID } from "node:crypto";
import { isManualFilename, manualExtension } from "@/lib/care";
import { requireStaffMachine } from "@/lib/care-http";
import { error, json } from "@/lib/http";
import {
  assertManualUploadAllowed,
  createManualUploadUrl,
  selectManualStoreKind,
  vercelRequiresManualObjectStorageMessage,
} from "@/lib/manual-storage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireStaffMachine(id);
  if ("error" in access) {
    return access.error;
  }
  return json({
    s3Upload: selectManualStoreKind() === "s3",
    clientUpload: false,
  });
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

  try {
    assertManualUploadAllowed();
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message : vercelRequiresManualObjectStorageMessage();
    return error(message, 503);
  }

  if (selectManualStoreKind() !== "s3") {
    return error(
      "Direct-to-storage upload is only available when R2/S3 is configured.",
      503,
    );
  }

  let body: { originalFileName?: string };
  try {
    body = (await request.json()) as { originalFileName?: string };
  } catch {
    return error("Expected JSON", 400);
  }

  const originalFileName =
    typeof body.originalFileName === "string" ? body.originalFileName.trim() : "";
  if (!originalFileName || !isManualFilename(originalFileName)) {
    return error("Manual must be a PDF or Word document.", 400);
  }

  const storedFileName = `${randomUUID()}${manualExtension(originalFileName)}`;
  try {
    const { uploadUrl } = await createManualUploadUrl(storedFileName);
    return json({ uploadUrl, storedFileName, method: "PUT" });
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message : "Could not start the manual upload.";
    return error(message, 400);
  }
}
