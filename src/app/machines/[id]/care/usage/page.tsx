import { RequireAuth } from "@/components/auth/RequireAuth";
import { UsagePanel } from "@/components/care/UsagePanel";

export default async function CareUsagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <RequireAuth role="staff">
      <UsagePanel machineId={id} />
    </RequireAuth>
  );
}
