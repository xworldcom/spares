import { RequireAuth } from "@/components/auth/RequireAuth";
import { MachinesList } from "@/components/machine/MachinesList";

export default function MachinesPage() {
  return (
    <RequireAuth>
      <div className="catalog-page">
        <div className="catalog-page-intro">
          <h1>Machines</h1>
          <p>Open a pack to inspect the model and request a quote.</p>
        </div>
        <MachinesList />
      </div>
    </RequireAuth>
  );
}
