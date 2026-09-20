import { RequireAuth } from "@/components/auth/RequireAuth";
import { MachinesList } from "@/components/machine/MachinesList";

export default function MachinesPage() {
  return (
    <RequireAuth>
      <div className="catalog-page">
        <div className="catalog-page-intro">
          <h1>Machines</h1>
          <p>
            Open a machine for the model, quotes, tickets, and manuals in one
            place. A 3D pack is optional.
          </p>
        </div>
        <MachinesList />
      </div>
    </RequireAuth>
  );
}
