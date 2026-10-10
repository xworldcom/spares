import {
  buildObsoleteLifecycleNotifications,
  type StoredPartLifecycleNotification,
} from "./lifecycle-notifications.ts";
import { createLifecycleEmailMailer } from "./notifications/lifecycle-email.ts";
import { lifecycleObsoleteNotifyEnabled } from "./lifecycle-notifications.ts";
import { effectiveLifecycle, normalizePartNumber, type PartLifecycleFields, type StoredPartLifecycle } from "./part-lifecycle.ts";
type NotificationDb = {
  partLifecycleNotifications?: import("./lifecycle-notifications.ts").StoredPartLifecycleNotification[];
  users: import("./store.ts").StoredUser[];
  machines: Array<{ id: string; siteId?: string; tenantId?: string }>;
  sites?: import("../types/index.ts").Site[];
  customers?: import("../types/index.ts").CustomerAccount[];
  partLifecycle?: import("./part-lifecycle.ts").StoredPartLifecycle[];
};

export type ObsoleteTransition = {
  partNumber: string;
  partName: string;
  machineIds: string[];
  machineNames: string[];
  lifecycle: PartLifecycleFields;
};

export function detectObsoleteTransitions(input: {
  tenantId: string;
  updates: Array<{ partNumber: string; patch: Partial<PartLifecycleFields> }>;
  rowsBefore: StoredPartLifecycle[];
  rowsAfter: StoredPartLifecycle[];
  catalogByPart: Map<string, { name: string; machineIds: string[]; machineNames: string[] }>;
}): ObsoleteTransition[] {
  const transitions: ObsoleteTransition[] = [];
  for (const update of input.updates) {
    const partNumber = normalizePartNumber(update.partNumber);
    const id = `${input.tenantId}::${partNumber}`;
    const before = input.rowsBefore.find((row) => row.id === id);
    const after = input.rowsAfter.find((row) => row.id === id);
    if (!after) {
      continue;
    }
    const prevStatus = effectiveLifecycle(before).status;
    const nextStatus = effectiveLifecycle(after).status;
    if (prevStatus === "obsolete" || nextStatus !== "obsolete") {
      continue;
    }
    const catalog = input.catalogByPart.get(partNumber);
    transitions.push({
      partNumber,
      partName: catalog?.name ?? partNumber,
      machineIds: catalog?.machineIds ?? [],
      machineNames: catalog?.machineNames ?? [],
      lifecycle: effectiveLifecycle(after),
    });
  }
  return transitions;
}

export async function applyObsoleteLifecycleNotifications(input: {
  db: NotificationDb;
  tenantId: string;
  transitions: ObsoleteTransition[];
  at: string;
}): Promise<{ notifications: StoredPartLifecycleNotification[] }> {
  if (input.transitions.length === 0) {
    return { notifications: input.db.partLifecycleNotifications ?? [] };
  }
  let rows = input.db.partLifecycleNotifications ?? [];
  const users = input.db.users.filter((user) => !user.deletedAt);
  const machines = input.db.machines.filter(
    (machine) => machine.tenantId === input.tenantId || !machine.tenantId,
  );
  const sites = input.db.sites ?? [];
  const customers = input.db.customers ?? [];
  const created: StoredPartLifecycleNotification[] = [];

  for (const transition of input.transitions) {
    const additions = buildObsoleteLifecycleNotifications({
      existing: rows,
      tenantId: input.tenantId,
      partNumber: transition.partNumber,
      partName: transition.partName,
      machineIds: transition.machineIds,
      machineNames: transition.machineNames,
      lifecycle: transition.lifecycle,
      users,
      machines,
      sites,
      customers,
      at: input.at,
    });
    if (additions.length === 0) {
      continue;
    }
    created.push(...additions);
    rows = [...rows, ...additions];
  }

  const mailer = createLifecycleEmailMailer();
  for (const row of created) {
    const user = users.find((candidate) => candidate.id === row.userId);
    if (!user?.email || !lifecycleObsoleteNotifyEnabled(user)) {
      continue;
    }
    await mailer.sendPartObsolete({
      to: user.email,
      role: user.role,
      partNumber: row.partNumber,
      name: row.partName,
      machineNames: row.machineNames,
      discontinuationDate: row.discontinuationDate,
      successorPartNumber: row.successorPartNumber,
    });
  }

  return { notifications: rows };
}
