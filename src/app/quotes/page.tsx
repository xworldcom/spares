import { RequireAuth } from "@/components/auth/RequireAuth";
import { QuotesWorkspace } from "@/components/quote/QuotesWorkspace";
import { loadQuotesListForSession } from "@/lib/quotes-list-server";

export default async function CustomerQuotesPage() {
  const initialList = await loadQuotesListForSession();
  return (
    <RequireAuth>
      <QuotesWorkspace initialList={initialList} />
    </RequireAuth>
  );
}
