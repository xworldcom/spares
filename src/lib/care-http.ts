import { getCurrentUser } from "@/lib/auth";
import { attachStaffAssistantAvailability } from "@/lib/assistant/public";
import { canAccessCareMachine, canManageCare, customerReadReceiptsForTicket, toPublicTicket } from "@/lib/care";
import { toPublicUser } from "@/lib/access";
import { error } from "@/lib/http";
import { tenantIdForUser, userTenantId } from "@/lib/tenant";
import { actorDisplayNamesForActivities } from "@/lib/chat-actor-display-server";
import {
  findUserById,
  getMachine,
  getOrgContext,
  getTicket,
  listCustomers,
  type StoredMachine,
} from "@/lib/store";
import type { PublicUser, ServiceTicket, ServiceTicketRecord, TicketCustomerReadReceipt } from "@/types";
import type { NextResponse } from "next/server";

export type MachineAccess =
  | { user: PublicUser; machine: StoredMachine }
  | { error: NextResponse };

export type TicketAccess =
  | { user: PublicUser; ticket: ServiceTicketRecord; machine: StoredMachine }
  | { error: NextResponse };

export async function requireMachineAccess(machineId: string): Promise<MachineAccess> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: error("Unauthorized", 401) };
  }
  const tenantId = tenantIdForUser(user);
  if (!tenantId) {
    return { error: error("Forbidden", 403) };
  }
  const [machine, org] = await Promise.all([
    getMachine(machineId, tenantId),
    getOrgContext(tenantId),
  ]);
  if (!machine || !canAccessCareMachine(user, machine, org.sites, org.customers)) {
    return { error: error("Machine not found", 404) };
  }
  return { user, machine };
}

export async function requireStaffMachine(machineId: string): Promise<MachineAccess> {
  const access = await requireMachineAccess(machineId);
  if ("error" in access) {
    return access;
  }
  if (!canManageCare(access.user)) {
    return { error: error("Forbidden", 403) };
  }
  return access;
}

export async function requireTicketAccess(idOrNumber: string): Promise<TicketAccess> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: error("Unauthorized", 401) };
  }
  const tenantId = tenantIdForUser(user);
  if (!tenantId) {
    return { error: error("Forbidden", 403) };
  }
  const ticket = await getTicket(idOrNumber, tenantId);
  if (!ticket) {
    return { error: error("Ticket not found", 404) };
  }
  const [machine, org] = await Promise.all([
    getMachine(ticket.machineId, tenantId),
    getOrgContext(tenantId),
  ]);
  if (!machine || !canAccessCareMachine(user, machine, org.sites, org.customers)) {
    return { error: error("Ticket not found", 404) };
  }
  return { user, ticket, machine };
}

export function actorOf(user: PublicUser) {
  return { id: user.id, email: user.email, role: user.role };
}

/** Plant owner on the ticket record — staff-opened tickets should not point at staff@. */
export async function resolveTicketOwnerContact(
  tenantId: string,
  machine: StoredMachine,
  user: PublicUser,
): Promise<{ customerId: string; customerEmail: string }> {
  if (user.role === "customer") {
    return { customerId: user.id, customerEmail: user.email };
  }
  const customers = await listCustomers(tenantId);
  const onMachine = customers.filter(
    (row) =>
      row.machineIds?.includes(machine.id) ||
      (machine.siteId ? row.siteIds?.includes(machine.siteId) : false),
  );
  const plant = onMachine[0] ?? customers.find((row) => row.role === "customer");
  if (plant) {
    return { customerId: plant.id, customerEmail: plant.email };
  }
  return { customerId: user.id, customerEmail: user.email };
}

export async function staffCustomerUsers(tenantId: string) {
  return listCustomers(tenantId);
}

export async function staffCustomerUsersForThread(
  tenantId: string,
  ticket: Pick<ServiceTicketRecord, "customerId">,
) {
  const customers = await staffCustomerUsers(tenantId);
  if (customers.some((row) => row.id === ticket.customerId)) {
    return customers;
  }
  const stored = await findUserById(ticket.customerId);
  if (!stored || stored.role !== "customer" || stored.deletedAt) {
    return customers;
  }
  if (stored.tenantId !== tenantId) {
    return customers;
  }
  const org = await getOrgContext(tenantId);
  return [...customers, toPublicUser(stored, org.sites, org.customers)].sort((a, b) =>
    a.email.localeCompare(b.email),
  );
}

export async function publicTicketForUser(
  ticket: ServiceTicketRecord,
  user: PublicUser,
  machineName: string,
): Promise<ServiceTicket> {
  const tenantId = userTenantId(user);
  const customerUsers =
    user.role === "staff" ? await staffCustomerUsersForThread(tenantId, ticket) : undefined;
  const base = toPublicTicket(ticket, user, machineName, { customerUsers });
  return attachStaffAssistantAvailability(user, {
    ...base,
    actorDisplayNames: await actorDisplayNamesForActivities(ticket.activities),
  });
}

export async function ticketReadReceiptsForStaff(
  ticket: ServiceTicketRecord,
  tenantId: string,
): Promise<TicketCustomerReadReceipt[]> {
  const customerUsers = await staffCustomerUsersForThread(tenantId, ticket);
  return customerReadReceiptsForTicket(ticket, customerUsers);
}
