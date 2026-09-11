import { MAX_CARE_TEXT, parseCareText, toPublicTicket } from "@/lib/care";
import { actorOf, requireTicketAccess } from "@/lib/care-http";
import { error, isErrorResponse, json, readJson } from "@/lib/http";
import { appendTicketActivity } from "@/lib/store";

type ActivityBody = {
  text?: unknown;
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
  const parsed = parseCareText(body.text, "Message", MAX_CARE_TEXT);
  if (!parsed.ok) {
    return error(parsed.error, 400);
  }

  const next = await appendTicketActivity(
    access.ticket.id,
    actorOf(access.user),
    parsed.text,
  );
  if (!next) {
    return error("Ticket not found", 404);
  }

  return json(
    { ticket: toPublicTicket(next, access.user, access.machine.name) },
    201,
  );
}
