import { handleChatAttachmentDownloadGet } from "@/lib/chat-attachment-http";
import { isChatStoredFileName } from "@/lib/chat-attachments";
import { error } from "@/lib/http";
import { requireQuoteAccess } from "@/lib/quote-http";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; storedFileName: string }> },
) {
  const { id, storedFileName } = await params;
  if (!isChatStoredFileName(storedFileName)) {
    return error("Attachment not found", 404);
  }
  const access = await requireQuoteAccess(id);
  if ("error" in access) {
    return access.error;
  }

  const key = `chat/${storedFileName}`;
  const isReferenced = access.quote.activities.some((activity) =>
    activity.attachments?.some((attachment) => attachment.r2Key === key),
  );
  return handleChatAttachmentDownloadGet(storedFileName, () => isReferenced);
}
