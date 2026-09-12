import { RequireAuth } from "@/components/auth/RequireAuth";
import { QuoteWorkspace } from "@/components/quote/QuoteWorkspace";

export default async function CustomerQuotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <RequireAuth role="customer">
      <QuoteWorkspace quoteRef={id} role="customer" />
    </RequireAuth>
  );
}
