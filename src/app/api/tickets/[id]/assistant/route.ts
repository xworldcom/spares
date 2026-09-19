import { publicTicketForUser, requireTicketAccess } from "@/lib/care-http";
import { error, isErrorResponse, json, readJson } from "@/lib/http";
import { userTenantId } from "@/lib/tenant";
import { setTicketAssistantPaused } from "@/lib/store";

type PatchBody = {
  paused?: unknown;
};

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
    return error("Only staff can turn AI off on a conversation", 403);
  }

  const body = await readJson<PatchBody>(request);
  if (isErrorResponse(body)) {
    return body;
  }
  if (typeof body.paused !== "boolean") {
    return error("paused must be a boolean", 400);
  }

  const tenantId = userTenantId(access.user);
  const next = await setTicketAssistantPaused(access.ticket.id, tenantId, body.paused);
  if (!next) {
    return error("Ticket not found", 404);
  }
  return json({
    ticket: await publicTicketForUser(next, access.user, access.machine.name),
  });
}
