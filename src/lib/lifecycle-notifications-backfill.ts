import {
  buildObsoleteLifecycleNotifications,
  type StoredPartLifecycleNotification,
} from "./lifecycle-notifications.ts";
import { effectiveLifecycle, normalizePartNumber } from "./part-lifecycle.ts";
import type { StoredUser } from "./store.ts";
import type { CustomerAccount, Site } from "../types/index.ts";

/** Idempotent: ensure in-app obsolete alerts exist for every obsolete PN on demo hardware. */
export function backfillObsoleteLifecycleNotifications(input: {
  existing: StoredPartLifecycleNotification[];
  tenantId: string;
  catalogRows: Array<{
    partNumber: string;
    name: string;
    machineIds: string[];
    machineNames: string[];
    lifecycle: ReturnType<typeof effectiveLifecycle>;
  }>;
  users: StoredUser[];
  machines: Array<{ id: string; siteId?: string; tenantId?: string }>;
  sites: Site[];
  customers: CustomerAccount[];
  at: string;
}): StoredPartLifecycleNotification[] {
  let rows = input.existing;
  const additions: StoredPartLifecycleNotification[] = [];
  for (const row of input.catalogRows) {
    if (row.lifecycle.status !== "obsolete") {
      continue;
    }
    const partNumber = normalizePartNumber(row.partNumber);
    const batch = buildObsoleteLifecycleNotifications({
      existing: rows,
      tenantId: input.tenantId,
      partNumber,
      partName: row.name,
      machineIds: row.machineIds,
      machineNames: row.machineNames,
      lifecycle: row.lifecycle,
      users: input.users,
      machines: input.machines,
      sites: input.sites,
      customers: input.customers,
      at: input.at,
    });
    if (batch.length === 0) {
      continue;
    }
    additions.push(...batch);
    rows = [...rows, ...batch];
  }
  return additions;
}
