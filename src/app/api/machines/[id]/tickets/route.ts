import {
  MAX_CARE_TEXT,
  MAX_TICKET_TITLE,
  parseCareText,
  parseOptionalCareText,
  toPublicTicket,
} from "@/lib/care";
import { actorOf, requireMachineAccess, resolveTicketOwnerContact } from "@/lib/care-http";
import { error, isErrorResponse, json, readJson, withCatalogConflict } from "@/lib/http";
import { userTenantId } from "@/lib/tenant";
import { actorFromUser, recordAccountActivity } from "@/lib/activity-log";
import { scheduleAssistantReply } from "@/lib/assistant/schedule";
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
  const tenantId = userTenantId(access.user);
  const tickets = await listTickets(tenantId, access.machine.id);
  const publicTickets = tickets.map((ticket) =>
    toPublicTicket(ticket, access.user, access.machine.name),
  );
  return json({
    tickets: publicTickets,
    unreadCount: publicTickets.filter((ticket) => ticket.unread).length,
  });
}

async function handlePOST(
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

  const tenantId = userTenantId(access.user);
  const owner = await resolveTicketOwnerContact(tenantId, access.machine, access.user);
  const created = await createTicket(tenantId, {
    machineId: access.machine.id,
    title: title.text,
    customerId: owner.customerId,
    customerEmail: owner.customerEmail,
    actor: actorOf(access.user),
    note: note.text,
  });
  if ("error" in created) {
    return error("Machine not found", 404);
  }

  await recordAccountActivity({
    tenantId,
    actor: actorFromUser(access.user),
    action: "ticket.created",
    summary: `${access.user.email} opened ticket #${created.ticket.number} on ${access.machine.name}.`,
    target: { type: "ticket", id: created.ticket.id, label: `#${created.ticket.number}` },
    details: { machineId: access.machine.id, title: created.ticket.title },
  });

  if (note.text) {
    scheduleAssistantReply({
      kind: "care",
      id: created.ticket.id,
      tenantId,
      machineId: access.machine.id,
      machineName: access.machine.name,
      triggerText: note.text,
      triggerRole: access.user.role,
      triggerEmail: access.user.email,
    });
  }

  return json(
    { ticket: toPublicTicket(created.ticket, access.user, access.machine.name) },
    201,
  );
}

export const POST = withCatalogConflict(handlePOST);
