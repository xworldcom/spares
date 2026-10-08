import { requireTicketAccess } from "@/lib/care-http";
import {
  handleChatAttachmentProxyPost,
  parseChatAttachmentProxyUpload,
} from "@/lib/chat-attachment-http";
import { error, withCatalogConflict } from "@/lib/http";

async function handlePOST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireTicketAccess(id);
  if ("error" in access) {
    return access.error;
  }

  const parsed = parseChatAttachmentProxyUpload(request);
  if (!parsed.ok) {
    return error(parsed.error, parsed.status);
  }
  return handleChatAttachmentProxyPost(
    request,
    parsed.storedFileName,
    parsed.originalFileName,
    parsed.sizeBytes,
    parsed.contentType,
  );
}

export const POST = withCatalogConflict(handlePOST);
