import { canAccessMachine } from "../access.ts";
import {
  getMachine,
  getOrgContext,
  listCustomers,
  listStaffUsersForTenant,
} from "../store.ts";
import type { CustomerAccount, PublicUser, Role, Site } from "../../types/index.ts";

export type NotifyRecipient = {
  userId: string;
  email: string;
  role: Role;
  name?: string;
};

export function isDeliverableEmail(email: string) {
  const trimmed = email.trim();
  if (!trimmed) {
    return false;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

type AccessUser = Pick<
  PublicUser,
  "id" | "email" | "role" | "siteIds" | "machineIds" | "companyAccess" | "tenantId" | "name"
>;

export function filterMachineChatNotifyRecipients(input: {
  users: readonly AccessUser[];
  machine: {
    id: string;
    siteId?: string | null;
    company?: string | null;
    tenantId?: string;
  };
  sites: readonly Site[];
  accounts: readonly CustomerAccount[];
  senderUserId: string;
  senderEmail: string;
}): NotifyRecipient[] {
  const senderEmail = input.senderEmail.trim().toLowerCase();
  const seen = new Set<string>();
  const recipients: NotifyRecipient[] = [];

  for (const user of input.users) {
    if (user.id === input.senderUserId) {
      continue;
    }
    if (!isDeliverableEmail(user.email)) {
      continue;
    }
    const normalized = user.email.trim().toLowerCase();
    if (normalized === senderEmail) {
      continue;
    }
    if (!canAccessMachine(user, input.machine, input.sites, input.accounts)) {
      continue;
    }
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    recipients.push({
      userId: user.id,
      email: user.email.trim(),
      role: user.role,
      name: user.name,
    });
  }

  return recipients.sort((a, b) => a.email.localeCompare(b.email));
}

export async function loadMachineChatNotifyRecipients(
  tenantId: string,
  machineId: string,
  sender: { id: string; email: string },
): Promise<NotifyRecipient[]> {
  const [machine, org, staffRows, customers] = await Promise.all([
    getMachine(machineId, tenantId),
    getOrgContext(tenantId),
    listStaffUsersForTenant(tenantId),
    listCustomers(tenantId),
  ]);
  if (!machine) {
    return [];
  }

  const users: AccessUser[] = [
    ...staffRows.map((row) => ({
      id: row.id,
      email: row.email,
      role: "staff" as const,
      tenantId: row.tenantId ?? tenantId,
      siteIds: [],
      machineIds: [],
    })),
    ...customers,
  ];

  return filterMachineChatNotifyRecipients({
    users,
    machine,
    sites: org.sites,
    accounts: org.customers,
    senderUserId: sender.id,
    senderEmail: sender.email,
  });
}
