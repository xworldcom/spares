import { getCurrentUser } from "@/lib/auth";
import type { StaffPartLifecycleResponse } from "@/lib/api/part-lifecycle";
import {
  filterCatalogRows,
  tallyPartLifecycleStatusCounts,
} from "@/lib/part-lifecycle";
import { readTenantPartLifecycleBaseSnapshot } from "@/lib/store";
import { tenantIdForUser } from "@/lib/tenant";

/** Default staff parts hub list (no filters) for RSC + client slot seed. */
export async function loadStaffPartLifecycleDefaultForSession(): Promise<StaffPartLifecycleResponse | null> {
  const user = await getCurrentUser();
  if (!user || user.role !== "staff") {
    return null;
  }
  const tenantId = tenantIdForUser(user);
  if (!tenantId) {
    return null;
  }
  const base = await readTenantPartLifecycleBaseSnapshot(tenantId);
  const statusCounts = tallyPartLifecycleStatusCounts(base.catalogRows);
  const parts = filterCatalogRows(base.catalogRows, { status: "all" });
  return {
    tenantId,
    parts,
    statusCounts,
    machines: base.machines.map((machine) => ({
      id: machine.id,
      name: machine.name,
      siteId: machine.siteId,
    })),
    generatedAt: new Date().toISOString(),
  };
}
