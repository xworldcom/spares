import { attachStaffAssistantAvailability } from "@/lib/assistant/public";
import { getCurrentUser } from "@/lib/auth";
import { staffCustomerUsersForThread } from "@/lib/care-http";
import { error } from "@/lib/http";
import { canViewQuote, toPublicQuote } from "@/lib/quotes";
import { effectiveTenantId, tenantIdForUser, userTenantId } from "@/lib/tenant";
import {
  enrichQuoteItemsWithLifecycle,
  lifecycleMapForQuotePartIds,
} from "@/lib/part-lifecycle";
import { getMachine, getQuote, listPartLifecycleRows } from "@/lib/store";
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
  const [customerUsers, rows] = await Promise.all([
    user.role === "staff" && tenantId
      ? staffCustomerUsersForThread(tenantId, quote)
      : Promise.resolve(undefined),
    tenantId ? listPartLifecycleRows() : Promise.resolve([]),
  ]);
  const base = toPublicQuote(quote, user, machineName, { customerUsers });
  if (!tenantId) {
    return attachStaffAssistantAvailability(user, base);
  }
  const map = lifecycleMapForQuotePartIds(rows, tenantId, partIds);
  const items = enrichQuoteItemsWithLifecycle(base.items, map, user.role);
  return attachStaffAssistantAvailability(user, { ...base, items });
}
