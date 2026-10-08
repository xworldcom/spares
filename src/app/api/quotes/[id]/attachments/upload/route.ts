import {
  chatUploadAvailability,
  handleChatAttachmentUploadPost,
  parseUploadJsonBody,
} from "@/lib/chat-attachment-http";
import { error, isErrorResponse, readJson, withCatalogConflict } from "@/lib/http";
import { requireQuoteAccess } from "@/lib/quote-http";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireQuoteAccess(id);
  if ("error" in access) {
    return access.error;
  }
  return chatUploadAvailability();
}

async function handlePOST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireQuoteAccess(id);
  if ("error" in access) {
    return access.error;
  }

  const body = await readJson<{
    originalFileName?: unknown;
    sizeBytes?: unknown;
    contentType?: unknown;
  }>(request);
  if (isErrorResponse(body)) {
    return body;
  }
  const parsed = parseUploadJsonBody(body);
  if (!parsed.ok) {
    return error(parsed.error, parsed.status);
  }
  return handleChatAttachmentUploadPost(
    request,
    parsed.originalFileName,
    parsed.sizeBytes,
    parsed.contentType,
    `/api/quotes/${id}/attachments/proxy`,
  );
}

export const POST = withCatalogConflict(handlePOST);
