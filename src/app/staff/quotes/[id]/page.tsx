import { RequireAuth } from "@/components/auth/RequireAuth";
import { QuoteWorkspace } from "@/components/quote/QuoteWorkspace";

export default async function StaffQuotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <RequireAuth role="staff">
      <QuoteWorkspace quoteRef={id} role="staff" />
    </RequireAuth>
  );
}
