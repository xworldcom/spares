import { MAX_CARE_TEXT } from "@/lib/care";
import { actorOf, publicTicketForUser, requireTicketAccess } from "@/lib/care-http";
import { verifyActivityAttachments } from "@/lib/chat-attachment-http";
import { parseChatActivityBody } from "@/lib/chat-attachments";
import { error, isErrorResponse, json, readJson, withCatalogConflict } from "@/lib/http";
import { userTenantId } from "@/lib/tenant";
import { notifyMachineChatUpdate } from "@/lib/notifications/chat-email";
import { actorFromUser, recordAccountActivity } from "@/lib/activity-log";
import { scheduleAssistantReply } from "@/lib/assistant/schedule";
import { appendTicketActivity } from "@/lib/store";

type ActivityBody = {
  text?: unknown;
  attachments?: unknown;
};

async function handlePOST(
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

  const verified = await verifyActivityAttachments(parsed.attachments, {
    ticketId: access.ticket.id,
  });
  if (!verified.ok) {
    return error(verified.error, verified.status);
  }

  const tenantId = userTenantId(access.user);
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

  await recordAccountActivity({
    tenantId,
    actor: actorFromUser(access.user),
    action: "ticket.message",
    summary: `${access.user.email} posted on ticket #${next.number}.`,
    target: { type: "ticket", id: next.id, label: `#${next.number}` },
    details: { attachmentCount: parsed.attachments?.length ?? 0 },
  });

  void notifyMachineChatUpdate({
    tenantId,
    sender: {
      id: access.user.id,
      email: access.user.email,
      name: access.user.name,
    },
    text: parsed.text,
    attachmentCount: parsed.attachments?.length ?? 0,
    context: {
      kind: "care",
      ticketId: next.id,
      ticketNumber: next.number,
      ticketTitle: next.title,
      machineId: next.machineId,
      machineName: access.machine.name,
    },
  }).catch((cause) => {
    console.error("care chat email notify failed", cause);
  });

  scheduleAssistantReply({
    kind: "care",
    id: next.id,
    tenantId,
    machineId: next.machineId,
    machineName: access.machine.name,
    triggerText: parsed.text,
    triggerRole: access.user.role,
    triggerEmail: access.user.email,
    attachments: parsed.attachments,
  });

  return json(
    { ticket: await publicTicketForUser(next, access.user, access.machine.name) },
    201,
  );
}

export const POST = withCatalogConflict(handlePOST);
