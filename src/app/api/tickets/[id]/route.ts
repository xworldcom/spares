import { isTicketStatus } from "@/lib/care";
import { actorOf, publicTicketForUser, requireTicketAccess } from "@/lib/care-http";
import { error, isErrorResponse, json, readJson } from "@/lib/http";
import { userTenantId } from "@/lib/tenant";
import { actorFromUser, recordAccountActivity, shouldRecordView } from "@/lib/activity-log";
import { isWarmConversationRequest } from "@/lib/api/warm-intent";
import { markTicketRead, updateTicketStatus } from "@/lib/store";

type PatchBody = {
  status?: unknown;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireTicketAccess(id);
  if ("error" in access) {
    return access.error;
  }
  const tenantId = userTenantId(access.user);
  let ticket = access.ticket;
  if (access.user.role === "staff" && !isWarmConversationRequest(_request)) {
    ticket = (await markTicketRead(access.ticket.id, tenantId, access.user.id)) ?? ticket;
    if (shouldRecordView(`ticket.viewed:${access.user.id}:${ticket.id}`)) {
      await recordAccountActivity({
        tenantId,
        actor: actorFromUser(access.user),
        action: "ticket.viewed",
        summary: `${access.user.email} opened ticket #${ticket.number}`,
        target: { type: "ticket", id: ticket.id, label: `#${ticket.number}` },
      });
    }
  }
  return json({
    ticket: await publicTicketForUser(ticket, access.user, access.machine.name),
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireTicketAccess(id);
  if ("error" in access) {
    return access.error;
  }
  if (access.user.role !== "staff") {
    return error("Only staff can change ticket status", 403);
  }

  const body = await readJson<PatchBody>(request);
  if (isErrorResponse(body)) {
    return body;
  }
  if (!isTicketStatus(body.status)) {
    return error("Choose a valid status", 400);
  }

  const tenantId = userTenantId(access.user);
  const next = await updateTicketStatus(
    access.ticket.id,
    tenantId,
    body.status,
    actorOf(access.user),
  );
  if (!next) {
    return error("Ticket not found", 404);
  }
  await recordAccountActivity({
    tenantId,
    actor: actorFromUser(access.user),
    action: "ticket.updated",
    summary: `${access.user.email} set ticket #${next.number} to ${next.status}.`,
    target: { type: "ticket", id: next.id, label: `#${next.number}` },
    details: { status: next.status },
  });
  return json({
    ticket: await publicTicketForUser(next, access.user, access.machine.name),
  });
}
