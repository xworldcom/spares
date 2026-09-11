import { RequireAuth } from "@/components/auth/RequireAuth";
import { MachinesList } from "@/components/machine/MachinesList";

export default function MachinesPage() {
  return (
    <RequireAuth>
      <div className="space-y-4">
        <div>
          <h1 className="text-[32px] font-semibold tracking-tight">Machines</h1>
          <p className="spares-muted mt-2 text-[15px] leading-relaxed">
            Open a pack to inspect the model and request a quote.
          </p>
        </div>
        <MachinesList />
      </div>
    </RequireAuth>
  );
}
