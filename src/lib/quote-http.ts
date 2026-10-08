import { attachStaffAssistantAvailability } from "@/lib/assistant/public";
import { getCurrentUser } from "@/lib/auth";
import { staffCustomerUsersForThread } from "@/lib/care-http";
import { error } from "@/lib/http";
import { canViewQuote, toPublicQuote } from "@/lib/quotes";
import { effectiveTenantId, tenantIdForUser, userTenantId } from "@/lib/tenant";
import {
  enrichQuoteItemsWithLifecycle,
  lifecycleMapForTenant,
} from "@/lib/part-lifecycle";
import { getQuote, listMachines, listPartLifecycleRows } from "@/lib/store";
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
  const machines = await listMachines(tenantId);
  return machines.find((machine) => machine.id === quote.machineId)?.name;
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
  const customerUsers =
    user.role === "staff" && tenantId
      ? await staffCustomerUsersForThread(tenantId, quote)
      : undefined;
  const base = toPublicQuote(quote, user, machineName, { customerUsers });
  if (!tenantId) {
    return attachStaffAssistantAvailability(user, base);
  }
  const rows = (await listPartLifecycleRows()).filter((row) => row.tenantId === tenantId);
  const map = lifecycleMapForTenant(rows, tenantId);
  const items = enrichQuoteItemsWithLifecycle(base.items, map, user.role);
  return attachStaffAssistantAvailability(user, { ...base, items });
}
