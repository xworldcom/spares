import { requireTicketAccess } from "@/lib/care-http";
import { handleChatAttachmentCompletePost } from "@/lib/chat-attachment-http";
import { isErrorResponse, readJson } from "@/lib/http";

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
    storedFileName?: string;
    uploadId?: string;
    parts?: Array<{ partNumber?: number; etag?: string }>;
  }>(request);
  if (isErrorResponse(body)) {
    return body;
  }
  return handleChatAttachmentCompletePost(request, body);
}
