import { attachStaffAssistantAvailability } from "@/lib/assistant/public";
import { actorDisplayNamesFromUsers } from "@/lib/chat-actor-display-server";
import { getCurrentUser } from "@/lib/auth";
import { error } from "@/lib/http";
import { canViewQuote, toPublicQuote } from "@/lib/quotes";
import { effectiveTenantId, tenantIdForUser, userTenantId } from "@/lib/tenant";
import {
  enrichQuoteItemsWithLifecycle,
  lifecycleMapForQuotePartIds,
} from "@/lib/part-lifecycle";
import { getMachine, getQuote, loadQuotePublicCatalogBundle } from "@/lib/store";
import type { PublicUser, Quote, QuoteRecord } from "@/types";
import type { NextResponse } from "next/server";

export type QuoteAccess =
  | { user: PublicUser; quote: QuoteRecord }
  | { error: NextResponse };

export async function requireQuoteAccess(
  idOrNumber: string,
): Promise<QuoteAccess> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: error("Unauthorized", 401) };
  }

  const tenantId = tenantIdForUser(user);
  if (!tenantId) {
    return { error: error("Forbidden", 403) };
  }
  const quote = await getQuote(idOrNumber, tenantId);
  if (!quote) {
    return { error: error("Quote not found", 404) };
  }
  if (!canViewQuote(quote, user)) {
    return { error: error("Forbidden", 403) };
  }

  return { user, quote };
}

export async function machineNameFor(quote: QuoteRecord) {
  const tenantId = effectiveTenantId(quote);
  const machine = await getMachine(quote.machineId, tenantId);
  return machine?.name;
}

export function actorOf(user: PublicUser) {
  return { id: user.id, email: user.email, role: user.role };
}

export async function publicQuoteForUser(
  quote: QuoteRecord,
  user: PublicUser,
  machineName?: string,
): Promise<Quote> {
  const tenantId = userTenantId(user);
  const partIds = quote.items.map((item) => item.id);

  if (!tenantId) {
    return attachStaffAssistantAvailability(user, toPublicQuote(quote, user, machineName));
  }

  const bundle = await loadQuotePublicCatalogBundle(tenantId, quote);
  const resolvedMachineName = machineName ?? bundle.machineName;
  const base = toPublicQuote(quote, user, resolvedMachineName, {
    customerUsers: user.role === "staff" ? bundle.customerUsers : undefined,
  });
  const map = lifecycleMapForQuotePartIds(bundle.partLifecycle, tenantId, partIds);
  const items = enrichQuoteItemsWithLifecycle(base.items, map, user.role);
  const actorDisplayNames = actorDisplayNamesFromUsers(
    quote.activities,
    bundle.catalogUsers,
  );
  return attachStaffAssistantAvailability(user, {
    ...base,
    items,
    actorDisplayNames,
  });
}
