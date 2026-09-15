import { MAX_CARE_TEXT, toPublicTicket } from "@/lib/care";
import { actorOf, requireTicketAccess } from "@/lib/care-http";
import { verifyActivityAttachments } from "@/lib/chat-attachment-http";
import { parseChatActivityBody } from "@/lib/chat-attachments";
import { error, isErrorResponse, json, readJson } from "@/lib/http";
import { tenantIdForUser } from "@/lib/tenant";
import { appendTicketActivity } from "@/lib/store";

type ActivityBody = {
  text?: unknown;
  attachments?: unknown;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireTicketAccess(id);
  if ("error" in access) {
    return access.error;
  }

  const body = await readJson<ActivityBody>(request);
  if (isErrorResponse(body)) {
    return body;
  }
  const parsed = parseChatActivityBody(body, MAX_CARE_TEXT, "Message");
  if (!parsed.ok) {
    return error(parsed.error, 400);
  }

  const verified = await verifyActivityAttachments(parsed.attachments);
  if (!verified.ok) {
    return error(verified.error, verified.status);
  }

  const tenantId = tenantIdForUser(access.user);
  const next = await appendTicketActivity(
    access.ticket.id,
    tenantId,
    actorOf(access.user),
    parsed.text,
    parsed.attachments,
  );
  if (!next) {
    return error("Ticket not found", 404);
  }

  return json(
    { ticket: toPublicTicket(next, access.user, access.machine.name) },
    201,
  );
}
