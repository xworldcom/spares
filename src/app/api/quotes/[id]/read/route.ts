import { machineNameFor, publicQuoteForUser, requireQuoteAccess } from "@/lib/quote-http";
import { bumpConversationWatchForCustomerRead } from "@/lib/chat-watch";
import { json } from "@/lib/http";
import { userTenantId } from "@/lib/tenant";
import { markQuoteRead } from "@/lib/store";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireQuoteAccess(id);
  if ("error" in access) {
    return access.error;
  }
  const tenantId = userTenantId(access.user);
  const before = access.quote.lastReadAt;
  const next =
    (await markQuoteRead(access.quote.id, tenantId, access.user.id)) ?? access.quote;
  const customerIds = access.user.role === "customer" ? [access.user.id] : [];
  await bumpConversationWatchForCustomerRead("quote", next.id, before, next.lastReadAt, customerIds);
  return json({
    quote: await publicQuoteForUser(next, access.user, await machineNameFor(next)),
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return PATCH(request, context);
}
