import { RequireAuth } from "@/components/auth/RequireAuth";
import { MachinesList } from "@/components/machine/MachinesList";
import { loadMachinesListForSession } from "@/lib/machines-list-server";

export default async function MachinesPage() {
  const initialList = await loadMachinesListForSession();
  return (
    <RequireAuth>
      <div className="catalog-page">
        <div className="catalog-page-intro">
          <h1>Machines</h1>
        </div>
        <MachinesList initialList={initialList} />
      </div>
    </RequireAuth>
  );
}
