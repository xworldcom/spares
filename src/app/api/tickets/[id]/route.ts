import { isTicketStatus } from "@/lib/care";
import { actorOf, publicTicketForUser, requireTicketAccess } from "@/lib/care-http";
import { NextResponse } from "next/server";
import {
  error,
  isErrorResponse,
  json,
  readJson,
  withCatalogConflict,
  withRecordConflict,
} from "@/lib/http";
import { etagMatches, ticketRecordEtag } from "@/lib/record-etag";
import { readRecordVersion } from "@/lib/record-meta";
import { userTenantId } from "@/lib/tenant";
import { actorFromUser, recordAccountActivity, shouldRecordView } from "@/lib/activity-log";
import { isWarmConversationRequest } from "@/lib/api/warm-intent";
import { markTicketRead, updateTicketStatus } from "@/lib/store";

type PatchBody = {
  status?: unknown;
  recordVersion?: unknown;
  /** Status the client had when recordVersion was read (detect same-field overwrite). */
  baseStatus?: unknown;
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
  const publicTicket = await publicTicketForUser(ticket, access.user, access.machine.name);
  const etag = ticketRecordEtag(ticket);
  if (etagMatches(_request, etag)) {
    return new NextResponse(null, {
      status: 304,
      headers: { ETag: etag, "Cache-Control": "private, no-store" },
    });
  }
  return NextResponse.json(
    { ticket: publicTicket },
    { status: 200, headers: { ETag: etag, "Cache-Control": "private, no-store" } },
  );
}

async function handlePATCH(
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
  const actor = actorOf(access.user);
  const expectedVersion =
    typeof body.recordVersion === "number" && body.recordVersion >= 1
      ? body.recordVersion
      : readRecordVersion(access.ticket);
  const clientBaseStatus = isTicketStatus(body.baseStatus)
    ? body.baseStatus
    : access.ticket.status;
  const clientBase = { ...access.ticket, status: clientBaseStatus };
  const next = await updateTicketStatus(access.ticket.id, tenantId, body.status, actor, {
    actor: { id: actor.id, email: actor.email, name: access.user.name },
    lock: {
      base: clientBase,
      expectedVersion,
      touchedFields: ["status"],
    },
  });
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

export const PATCH = withCatalogConflict(withRecordConflict("ticket", handlePATCH));
