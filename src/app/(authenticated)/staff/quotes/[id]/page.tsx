import { RequireAuth } from "@/components/auth/RequireAuth";
import { QuoteWorkspace } from "@/components/quote/QuoteWorkspace";
import { loadQuoteDetailForSession } from "@/lib/quote-detail-server";

export default async function StaffQuotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const initialQuote = await loadQuoteDetailForSession(id);
  return (
    <RequireAuth role="staff">
      <QuoteWorkspace quoteRef={id} role="staff" initialQuote={initialQuote} />
    </RequireAuth>
  );
}
