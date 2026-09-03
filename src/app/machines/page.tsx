import { RequireAuth } from "@/components/auth/RequireAuth";
import { MachinesList } from "@/components/machine/MachinesList";

export default function MachinesPage() {
  return (
    <RequireAuth>
      <div className="space-y-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight">Machines</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Open a pack to inspect the model and request a quote.
          </p>
        </div>
        <MachinesList />
      </div>
    </RequireAuth>
  );
}
