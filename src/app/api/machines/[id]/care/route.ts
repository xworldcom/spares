import { ticketIsOpen, toPublicTicket } from "@/lib/care";
import { requireMachineAccess } from "@/lib/care-http";
import { json } from "@/lib/http";
import { toMachineSummary } from "@/lib/machines";
import {
  getMachineUsage,
  getOrgContext,
  listManuals,
  listTickets,
} from "@/lib/store";
import type { CareOverview } from "@/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireMachineAccess(id);
  if ("error" in access) {
    return access.error;
  }

  const [manuals, tickets, usage, org] = await Promise.all([
    listManuals(access.machine.id),
    listTickets(access.machine.id),
    getMachineUsage(access.machine.id),
    getOrgContext(),
  ]);

  const overview: CareOverview = {
    machine: toMachineSummary(access.machine, org.sites, org.customers),
    manuals: manuals.length,
    ticketsOpen: tickets.filter((ticket) => ticketIsOpen(ticket.status)).length,
    ticketsTotal: tickets.length,
  };
  if (access.user.role === "staff" && usage) {
    overview.usage = {
      hours: usage.hours,
      cycles: usage.cycles,
      lastServiceAt: usage.lastServiceAt,
      notes: usage.notes,
      updatedAt: usage.updatedAt,
    };
  }

  return json({
    overview,
    recentTickets: tickets.slice(0, 5).map((ticket) =>
      toPublicTicket(ticket, access.user, access.machine.name),
    ),
  });
}
