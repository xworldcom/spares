import { canAccessMachine } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { effectiveStaffTenantId } from "@/lib/tenant";
import { machineIdFromPath } from "@/lib/machine-context";
import type { MachineNameSeed } from "@/lib/machine-name-cache";
import { findUserById, getMachine, getOrgContext } from "@/lib/store";

export async function resolveMachineBootstrapFromPath(
  pathname: string,
): Promise<MachineNameSeed | null> {
    const machineId = machineIdFromPath(pathname);
    if (!machineId) {
      return null;
    }

    const user = await getCurrentUser();
    if (!user) {
      return null;
    }

    const stored = await findUserById(user.id);
    const tenantId = stored ? effectiveStaffTenantId(stored) : user.tenantId ?? null;
    if (!tenantId) {
      return null;
    }

    const [machine, org] = await Promise.all([
      getMachine(machineId, tenantId),
      getOrgContext(tenantId),
    ]);
    if (!machine || !canAccessMachine(user, machine, org.sites, org.customers)) {
      return null;
    }

    const name = machine.name?.trim();
    if (!name) {
      return null;
    }

  return { id: machineId, name };
}
