import { RequireAuth } from "@/components/auth/RequireAuth";
import { CustomerQuotePage } from "@/components/quote/CustomerQuotePage";
import { loadQuoteDetailForSession } from "@/lib/quote-detail-server";

export default async function CustomerQuoteRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const initialQuote = await loadQuoteDetailForSession(id);
  return (
    <RequireAuth>
      <CustomerQuotePage quoteRef={id} initialQuote={initialQuote} />
    </RequireAuth>
  );
}
