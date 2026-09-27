import { publicTicketForUser, requireTicketAccess, ticketReadReceiptsForStaff } from "@/lib/care-http";
import { bumpConversationWatchForCustomerRead } from "@/lib/chat-watch";
import { error, json } from "@/lib/http";
import { userTenantId } from "@/lib/tenant";
import { markTicketRead } from "@/lib/store";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireTicketAccess(id);
  if ("error" in access) {
    return access.error;
  }
  if (access.user.role !== "staff") {
    return error("Only staff can view read receipts", 403);
  }
  const tenantId = userTenantId(access.user);
  const receipts = await ticketReadReceiptsForStaff(access.ticket, tenantId);
  return json({ receipts });
}

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireTicketAccess(id);
  if ("error" in access) {
    return access.error;
  }
  const tenantId = userTenantId(access.user);
  const before = access.ticket.lastReadAt;
  const next =
    (await markTicketRead(access.ticket.id, tenantId, access.user.id)) ?? access.ticket;
  const customerIds = access.user.role === "customer" ? [access.user.id] : [];
  await bumpConversationWatchForCustomerRead("ticket", next.id, before, next.lastReadAt, customerIds);
  return json({
    ticket: await publicTicketForUser(next, access.user, access.machine.name),
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return PATCH(request, context);
}
