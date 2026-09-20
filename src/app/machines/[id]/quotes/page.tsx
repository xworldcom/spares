import { RequireAuth } from "@/components/auth/RequireAuth";
import { MachineQuotesWorkspace } from "@/components/quote/QuotesWorkspace";

export default async function MachineQuotesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <RequireAuth>
      <MachineQuotesWorkspace machineId={id} />
    </RequireAuth>
  );
}
