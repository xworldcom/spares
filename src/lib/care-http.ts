import { getCurrentUser } from "@/lib/auth";
import { canAccessCareMachine, canManageCare } from "@/lib/care";
import { error } from "@/lib/http";
import { getMachine, getTicket, listSites, type StoredMachine } from "@/lib/store";
import type { PublicUser, ServiceTicketRecord } from "@/types";
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
  const [machine, sites] = await Promise.all([getMachine(machineId), listSites()]);
  if (!machine || !canAccessCareMachine(user, machine, sites)) {
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
  const ticket = await getTicket(idOrNumber);
  if (!ticket) {
    return { error: error("Ticket not found", 404) };
  }
  const [machine, sites] = await Promise.all([
    getMachine(ticket.machineId),
    listSites(),
  ]);
  if (!machine || !canAccessCareMachine(user, machine, sites)) {
    return { error: error("Ticket not found", 404) };
  }
  return { user, ticket, machine };
}

export function actorOf(user: PublicUser) {
  return { id: user.id, email: user.email, role: user.role };
}
