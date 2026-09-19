import { verifyActivityAttachments } from "@/lib/chat-attachment-http";
import { parseChatActivityBody } from "@/lib/chat-attachments";
import { error, isErrorResponse, json, readJson } from "@/lib/http";
import { actorOf, machineNameFor, publicQuoteForUser, requireQuoteAccess } from "@/lib/quote-http";
import { MAX_ACTIVITY_TEXT } from "@/lib/quotes";
import { userTenantId } from "@/lib/tenant";
import { notifyMachineChatUpdate } from "@/lib/notifications/chat-email";
import { actorFromUser, recordAccountActivity } from "@/lib/activity-log";
import { scheduleAssistantReply } from "@/lib/assistant/schedule";
import { appendQuoteActivity } from "@/lib/store";

type ActivityBody = {
  text?: unknown;
  attachments?: unknown;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireQuoteAccess(id);
  if ("error" in access) {
    return access.error;
  }

  const body = await readJson<ActivityBody>(request);
  if (isErrorResponse(body)) {
    return body;
  }

  const parsed = parseChatActivityBody(body, MAX_ACTIVITY_TEXT, "Message");
  if (!parsed.ok) {
    return error(parsed.error, 400);
  }

  const verified = await verifyActivityAttachments(parsed.attachments, {
    quoteId: access.quote.id,
  });
  if (!verified.ok) {
    return error(verified.error, verified.status);
  }

  const tenantId = userTenantId(access.user);
  const next = await appendQuoteActivity(
    access.quote.id,
    tenantId,
    actorOf(access.user),
    "message",
    parsed.text,
    parsed.attachments,
  );
  if (!next) {
    return error("Quote not found", 404);
  }

  await recordAccountActivity({
    tenantId,
    actor: actorFromUser(access.user),
    action: "quote.message",
    summary: `${access.user.email} posted on quote #${next.number}.`,
    target: { type: "quote", id: next.id, label: `#${next.number}` },
    details: { attachmentCount: parsed.attachments?.length ?? 0 },
  });

  const machineName = (await machineNameFor(next)) ?? "Machine";
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
      kind: "quote",
      quoteNumber: next.number,
      machineId: next.machineId,
      machineName,
    },
  }).catch((cause) => {
    console.error("quote chat email notify failed", cause);
  });

  scheduleAssistantReply({
    kind: "quote",
    id: next.id,
    tenantId,
    machineId: next.machineId,
    machineName,
    triggerText: parsed.text,
    triggerRole: access.user.role,
    triggerEmail: access.user.email,
    attachments: parsed.attachments,
  });

  return json(
    { quote: await publicQuoteForUser(next, access.user, machineName) },
    201,
  );
}
