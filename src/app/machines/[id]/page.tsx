import { RequireAuth } from "@/components/auth/RequireAuth";
import { MachineWorkspace } from "@/components/machine/MachineWorkspace";

export default async function MachinePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <RequireAuth>
      <MachineWorkspace machineId={id} />
    </RequireAuth>
  );
}
