import { requireTicketAccess } from "@/lib/care-http";
import { handleChatAttachmentDownloadGet } from "@/lib/chat-attachment-http";
import { isChatStoredFileName } from "@/lib/chat-attachments";
import { error } from "@/lib/http";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; storedFileName: string }> },
) {
  const { id, storedFileName } = await params;
  if (!isChatStoredFileName(storedFileName)) {
    return error("Attachment not found", 404);
  }
  const access = await requireTicketAccess(id);
  if ("error" in access) {
    return access.error;
  }

  const key = `chat/${storedFileName}`;
  const isReferenced = access.ticket.activities.some((activity) =>
    activity.attachments?.some((attachment) => attachment.r2Key === key),
  );
  return handleChatAttachmentDownloadGet(storedFileName, () => isReferenced);
}
