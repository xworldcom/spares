import { RequireAuth } from "@/components/auth/RequireAuth";
import { MachineQuotesWorkspace } from "@/components/quote/QuotesWorkspace";
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
      <MachineQuotesWorkspace machineId={id} initialList={initialList} />
    </RequireAuth>
  );
}
