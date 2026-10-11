import { Suspense } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { MachineQuotesWorkspace } from "@/components/quote/QuotesWorkspace";
import { LoadingState } from "@/components/states/LoadingState";
import { loadQuotesListForSession } from "@/lib/quotes-list-server";

export default async function MachineQuotesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const initialList = await loadQuotesListForSession();
  return (
    <RequireAuth>
      <Suspense fallback={<LoadingState label="Loading quotes…" />}>
        <MachineQuotesWorkspace machineId={id} initialList={initialList} />
      </Suspense>
    </RequireAuth>
  );
}
