import { requireTicketAccess } from "@/lib/care-http";
import {
  chatUploadAvailability,
  handleChatAttachmentUploadPost,
  parseUploadJsonBody,
} from "@/lib/chat-attachment-http";
import { error, isErrorResponse, json, readJson } from "@/lib/http";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireTicketAccess(id);
  if ("error" in access) {
    return access.error;
  }
  return chatUploadAvailability();
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireTicketAccess(id);
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
    `/api/tickets/${id}/attachments/proxy`,
  );
}
