import { randomUUID } from "node:crypto";
import { canAccessMachine } from "./access.ts";
import type { CustomerAccount, Site } from "../types/index.ts";
import type { StoredUser } from "./store.ts";
import type { PartLifecycleFields } from "./part-lifecycle.ts";
import { normalizePartNumber } from "./part-lifecycle.ts";

export type PartLifecycleNotificationKind = "part_obsolete";

export type StoredPartLifecycleNotification = {
  id: string;
  tenantId: string;
  userId: string;
  partNumber: string;
  partName: string;
  kind: PartLifecycleNotificationKind;
  machineIds: string[];
  machineNames: string[];
  successorPartNumber?: string;
  discontinuationDate?: string;
  createdAt: string;
  readAt?: string;
  dedupeKey: string;
};

export const LIFECYCLE_OBSOLETE_NOTIFY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export function lifecycleObsoleteNotifyEnabled(user: Pick<StoredUser, "lifecycleNotifyObsolete">) {
  return user.lifecycleNotifyObsolete !== false;
}

export function lifecycleNotificationDedupeKey(
  tenantId: string,
  userId: string,
  partNumber: string,
) {
  return `${tenantId}:${userId}:${normalizePartNumber(partNumber)}:obsolete`;
}

export function listLifecycleNotificationsForUser(
  rows: StoredPartLifecycleNotification[] | undefined,
  tenantId: string,
  userId: string,
  filter?: { unreadOnly?: boolean },
) {
  return (rows ?? [])
    .filter((row) => row.tenantId === tenantId && row.userId === userId)
    .filter((row) => !filter?.unreadOnly || !row.readAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function countUnreadLifecycleNotifications(
  rows: StoredPartLifecycleNotification[] | undefined,
  tenantId: string,
  userId: string,
) {
  return listLifecycleNotificationsForUser(rows, tenantId, userId, { unreadOnly: true }).length;
}

export function unreadLifecyclePartNumbers(
  rows: StoredPartLifecycleNotification[] | undefined,
  tenantId: string,
  userId: string,
) {
  const set = new Set<string>();
  for (const row of listLifecycleNotificationsForUser(rows, tenantId, userId, {
    unreadOnly: true,
  })) {
    set.add(normalizePartNumber(row.partNumber));
  }
  return set;
}

export function markLifecycleNotificationRead(
  rows: StoredPartLifecycleNotification[],
  tenantId: string,
  userId: string,
  notificationId: string,
  at: string,
) {
  const index = rows.findIndex(
    (row) =>
      row.id === notificationId && row.tenantId === tenantId && row.userId === userId,
  );
  if (index < 0) {
    return { rows, changed: false };
  }
  if (rows[index].readAt) {
    return { rows, changed: false };
  }
  const copy = rows.slice();
  copy[index] = { ...copy[index], readAt: at };
  return { rows: copy, changed: true };
}

export function markAllLifecycleNotificationsRead(
  rows: StoredPartLifecycleNotification[],
  tenantId: string,
  userId: string,
  at: string,
) {
  let changed = false;
  const copy = rows.map((row) => {
    if (row.tenantId !== tenantId || row.userId !== userId || row.readAt) {
      return row;
    }
    changed = true;
    return { ...row, readAt: at };
  });
  return { rows: copy, changed };
}

function machineAccessUsers(input: {
  users: StoredUser[];
  tenantId: string;
  machineIds: string[];
  machines: Array<{ id: string; siteId?: string; tenantId?: string }>;
  sites: Site[];
  customers: CustomerAccount[];
}) {
  const machineById = new Map(input.machines.map((machine) => [machine.id, machine]));
  const recipients: StoredUser[] = [];
  for (const user of input.users) {
    if (user.deletedAt || !lifecycleObsoleteNotifyEnabled(user)) {
      continue;
    }
    if (user.role === "staff") {
      if (
        user.tenantId === input.tenantId ||
        user.staffCreatedTenantId === input.tenantId
      ) {
        recipients.push(user);
      }
      continue;
    }
    if (user.role !== "customer") {
      continue;
    }
    if (user.tenantId !== input.tenantId) {
      continue;
    }
    const hasMachine = input.machineIds.some((machineId) => {
      const machine = machineById.get(machineId);
      if (!machine) {
        return false;
      }
      return canAccessMachine(user, machine, input.sites, input.customers);
    });
    if (hasMachine) {
      recipients.push(user);
    }
  }
  return recipients;
}

export function buildObsoleteLifecycleNotifications(input: {
  existing: StoredPartLifecycleNotification[];
  tenantId: string;
  partNumber: string;
  partName: string;
  machineIds: string[];
  machineNames: string[];
  lifecycle: PartLifecycleFields;
  users: StoredUser[];
  machines: Array<{ id: string; siteId?: string; tenantId?: string }>;
  sites: Site[];
  customers: CustomerAccount[];
  at: string;
}): StoredPartLifecycleNotification[] {
  const recipients = machineAccessUsers({
    users: input.users,
    tenantId: input.tenantId,
    machineIds: input.machineIds,
    machines: input.machines,
    sites: input.sites,
    customers: input.customers,
  });
  const additions: StoredPartLifecycleNotification[] = [];
  const have = new Set(input.existing.map((row) => row.dedupeKey));
  for (const user of recipients) {
    const dedupeKey = lifecycleNotificationDedupeKey(input.tenantId, user.id, input.partNumber);
    if (have.has(dedupeKey)) {
      continue;
    }
    have.add(dedupeKey);
    additions.push({
      id: randomUUID(),
      tenantId: input.tenantId,
      userId: user.id,
      partNumber: normalizePartNumber(input.partNumber),
      partName: input.partName,
      kind: "part_obsolete",
      machineIds: [...input.machineIds],
      machineNames: [...input.machineNames],
      ...(input.lifecycle.successorPartNumber
        ? { successorPartNumber: input.lifecycle.successorPartNumber }
        : {}),
      ...(input.lifecycle.discontinuationDate
        ? { discontinuationDate: input.lifecycle.discontinuationDate }
        : {}),
      createdAt: input.at,
      dedupeKey,
    });
  }
  return additions;
}

export function toPublicLifecycleNotification(
  row: StoredPartLifecycleNotification,
  lifecycleStatus: import("../types/index.ts").PartLifecycleStatus = "obsolete",
) {
  return {
    id: row.id,
    partNumber: row.partNumber,
    partName: row.partName,
    kind: row.kind,
    lifecycleStatus,
    machineIds: row.machineIds,
    machineNames: row.machineNames,
    successorPartNumber: row.successorPartNumber,
    discontinuationDate: row.discontinuationDate,
    createdAt: row.createdAt,
    readAt: row.readAt,
    unread: !row.readAt,
  };
}
