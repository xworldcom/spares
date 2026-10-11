import { getCurrentUser } from "@/lib/auth";
import { publicQuoteForUser } from "@/lib/quote-http";
import { canViewQuote } from "@/lib/quotes";
import { readQuoteDetailCatalog } from "@/lib/store";
import { tenantIdForUser } from "@/lib/tenant";
import type { Quote } from "@/types";

export async function loadQuoteDetailForSession(
  quoteRef: string,
): Promise<Quote | null> {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }
  const tenantId = tenantIdForUser(user);
  if (!tenantId) {
    return null;
  }
  const detail = await readQuoteDetailCatalog(quoteRef, tenantId, user.id, {
    markRead: false,
  });
  if (!detail || !canViewQuote(detail.quote, user)) {
    return null;
  }
  return await publicQuoteForUser(detail.quote, user, undefined, detail.bundle);
}
