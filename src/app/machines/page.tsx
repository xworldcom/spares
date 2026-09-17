import { RequireAuth } from "@/components/auth/RequireAuth";
import { MachinesList } from "@/components/machine/MachinesList";

export default function MachinesPage() {
  return (
    <RequireAuth>
      <div className="catalog-page">
        <div className="catalog-page-intro">
          <h1>Machines</h1>
          <p>Inspect a model, open Care, or request a quote. Machines do not need a 3D pack.</p>
        </div>
        <MachinesList />
      </div>
    </RequireAuth>
  );
}
