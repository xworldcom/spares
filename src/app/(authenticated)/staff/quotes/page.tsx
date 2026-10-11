import { Suspense } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { QuotesWorkspace } from "@/components/quote/QuotesWorkspace";
import { LoadingState } from "@/components/states/LoadingState";
import { loadQuotesListForSession } from "@/lib/quotes-list-server";

export default async function StaffQuotesPage() {
  const initialList = await loadQuotesListForSession();
  return (
    <RequireAuth role="staff">
      <Suspense fallback={<LoadingState label="Loading quotes…" />}>
        <QuotesWorkspace role="staff" initialList={initialList} />
      </Suspense>
    </RequireAuth>
  );
}
