import { canAccessMachine } from "@/lib/access";
import type { MachinesListResponse } from "@/lib/api/types";
import { toMachineSummary } from "@/lib/machines";
import { readTenantMachinesListSnapshot } from "@/lib/store";
import type { PublicUser } from "@/types";

/** Shared machines list body for Route Handler + RSC (one catalog read path). */
export async function buildMachinesListPayload(
  user: PublicUser,
  tenantId: string,
  options?: { heal?: boolean },
): Promise<MachinesListResponse> {
  const snapshot = await readTenantMachinesListSnapshot(tenantId, {
    heal: options?.heal ?? false,
  });
  const visible = snapshot.machines.filter((machine) =>
    canAccessMachine(user, machine, snapshot.sites, snapshot.customers),
  );
  return {
    machines: visible.map((machine) =>
      toMachineSummary(machine, snapshot.sites, snapshot.customers, user),
    ),
  };
}
