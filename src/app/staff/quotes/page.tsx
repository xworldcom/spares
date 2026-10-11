import { RequireAuth } from "@/components/auth/RequireAuth";
import { QuotesWorkspace } from "@/components/quote/QuotesWorkspace";
import { loadQuotesListForSession } from "@/lib/quotes-list-server";

export default async function StaffQuotesPage() {
  const initialList = await loadQuotesListForSession();
  return (
    <RequireAuth role="staff">
      <QuotesWorkspace role="staff" initialList={initialList} />
    </RequireAuth>
  );
}
