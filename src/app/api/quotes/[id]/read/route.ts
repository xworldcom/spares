import { machineNameFor, publicQuoteForUser, requireQuoteAccess } from "@/lib/quote-http";
import { bumpConversationWatchForCustomerRead } from "@/lib/chat-watch";
import { json, withCatalogConflict } from "@/lib/http";
import { userTenantId } from "@/lib/tenant";
import { markQuoteRead } from "@/lib/store";

async function handlePATCH(
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

async function handlePOST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return PATCH(request, context);
}

export const PATCH = withCatalogConflict(handlePATCH);
export const POST = withCatalogConflict(handlePOST);
