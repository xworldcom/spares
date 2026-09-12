import {
  MAX_CARE_TEXT,
  MAX_TICKET_TITLE,
  parseCareText,
  parseOptionalCareText,
  toPublicTicket,
} from "@/lib/care";
import { actorOf, requireMachineAccess } from "@/lib/care-http";
import { error, isErrorResponse, json, readJson } from "@/lib/http";
import { createTicket, listTickets } from "@/lib/store";

type CreateBody = {
  title?: unknown;
  note?: unknown;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireMachineAccess(id);
  if ("error" in access) {
    return access.error;
  }
  const tickets = await listTickets(access.machine.id);
  const publicTickets = tickets.map((ticket) =>
    toPublicTicket(ticket, access.user, access.machine.name),
  );
  return json({
    tickets: publicTickets,
    unreadCount: publicTickets.filter((ticket) => ticket.unread).length,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireMachineAccess(id);
  if ("error" in access) {
    return access.error;
  }

  const body = await readJson<CreateBody>(request);
  if (isErrorResponse(body)) {
    return body;
  }

  const title = parseCareText(body.title, "Title", MAX_TICKET_TITLE);
  if (!title.ok) {
    return error(title.error, 400);
  }
  const note = parseOptionalCareText(body.note, "Note", MAX_CARE_TEXT);
  if (!note.ok) {
    return error(note.error, 400);
  }

  const created = await createTicket({
    machineId: access.machine.id,
    title: title.text,
    customerId: access.user.id,
    customerEmail: access.user.email,
    actor: actorOf(access.user),
    note: note.text,
  });
  if ("error" in created) {
    return error("Machine not found", 404);
  }

  return json(
    { ticket: toPublicTicket(created.ticket, access.user, access.machine.name) },
    201,
  );
}
