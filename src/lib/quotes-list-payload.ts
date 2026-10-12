import { staffAssistantEnabled } from "@/lib/assistant/public";
import type { QuotesListResponse } from "@/lib/api/types";
import { isSeedAllowed } from "@/lib/production-env";
import { quoteIsOpen, toPublicQuoteListRow } from "@/lib/quotes";
import {
  ensureDemoStageQuoteFixtures,
  ensurePreviewQaQuoteFixture,
  readTenantWorkListSnapshot,
} from "@/lib/store";
import type { PublicUser } from "@/types";

/** Shared quotes list body for Route Handler + RSC (one catalog read path). */
export async function buildQuotesListPayload(
  user: PublicUser,
  tenantId: string,
): Promise<QuotesListResponse> {
  if (user.role === "staff" && isSeedAllowed()) {
    await ensurePreviewQaQuoteFixture(tenantId);
    await ensureDemoStageQuoteFixtures(tenantId);
  }

  const snapshot = await readTenantWorkListSnapshot(tenantId);
  const names = new Map(snapshot.machines.map((machine) => [machine.id, machine.name]));
  const visible = snapshot.quotes
    .filter((quote) => user.role === "staff" || !quote.hiddenFromCustomer)
    .filter((quote) => user.role === "staff" || quote.customerId === user.id);

  const assistantAvailable =
    user.role === "staff" ? await staffAssistantEnabled() : false;

  const publicQuotes = visible.map((quote) =>
    toPublicQuoteListRow(quote, user, names.get(quote.machineId), {
      assistantAvailable: user.role === "staff" ? assistantAvailable : undefined,
    }),
  );

  return {
    quotes: publicQuotes,
    unreadCount: publicQuotes.filter(
      (quote) => quote.unread && quoteIsOpen(quote.status),
    ).length,
  };
}
