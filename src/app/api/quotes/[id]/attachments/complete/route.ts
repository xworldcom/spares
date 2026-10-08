import { handleChatAttachmentCompletePost } from "@/lib/chat-attachment-http";
import { isErrorResponse, readJson, withCatalogConflict } from "@/lib/http";
import { requireQuoteAccess } from "@/lib/quote-http";

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
    storedFileName?: string;
    uploadId?: string;
    parts?: Array<{ partNumber?: number; etag?: string }>;
  }>(request);
  if (isErrorResponse(body)) {
    return body;
  }
  return handleChatAttachmentCompletePost(request, body);
}

export const POST = withCatalogConflict(handlePOST);
