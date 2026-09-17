import { RequireAuth } from "@/components/auth/RequireAuth";
import { QuotesWorkspace } from "@/components/quote/QuotesWorkspace";

export default function CustomerQuotesPage() {
  return (
    <RequireAuth role="customer">
      <QuotesWorkspace />
    </RequireAuth>
  );
}
