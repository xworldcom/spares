import { isTicketStatus, toPublicTicket } from "@/lib/care";
import { actorOf, requireTicketAccess } from "@/lib/care-http";
import { error, isErrorResponse, json, readJson } from "@/lib/http";
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
  await markTicketRead(access.ticket.id, access.user.id);
  return json({
    ticket: toPublicTicket(access.ticket, access.user, access.machine.name),
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

  const next = await updateTicketStatus(
    access.ticket.id,
    body.status,
    actorOf(access.user),
  );
  if (!next) {
    return error("Ticket not found", 404);
  }
  return json({
    ticket: toPublicTicket(next, access.user, access.machine.name),
  });
}
