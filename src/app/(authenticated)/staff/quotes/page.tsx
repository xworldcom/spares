import type { Metadata } from "next";
import { Suspense } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { RouteDocumentTitle } from "@/components/nav/RouteDocumentTitle";
import { QuotesWorkspace } from "@/components/quote/QuotesWorkspace";
import { LoadingState } from "@/components/states/LoadingState";
import { loadQuotesListForSession } from "@/lib/quotes-list-server";

export const metadata: Metadata = {
  title: "Quotes",
};

export default async function StaffQuotesPage() {
  const initialList = await loadQuotesListForSession();
  return (
    <RequireAuth role="staff">
      <RouteDocumentTitle title="Quotes" />
      <Suspense fallback={<LoadingState label="Loading quotes…" />}>
        <QuotesWorkspace role="staff" initialList={initialList} />
      </Suspense>
    </RequireAuth>
  );
}
