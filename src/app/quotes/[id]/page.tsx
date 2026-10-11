import { RequireAuth } from "@/components/auth/RequireAuth";
import { CustomerQuotePage } from "@/components/quote/CustomerQuotePage";

export default async function CustomerQuoteRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <RequireAuth>
      <CustomerQuotePage quoteRef={id} />
    </RequireAuth>
  );
}
