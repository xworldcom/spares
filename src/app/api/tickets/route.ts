import { canAccessMachine } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { toPublicTicket } from "@/lib/care";
import { json } from "@/lib/http";
import { listMachines, listSites, listTickets } from "@/lib/store";

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) {
    return auth.error;
  }

  const [tickets, machines, sites] = await Promise.all([
    listTickets(),
    listMachines(),
    listSites(),
  ]);
  const visible = new Map(
    machines
      .filter((machine) => canAccessMachine(auth.user, machine, sites))
      .map((machine) => [machine.id, machine.name]),
  );

  const filtered = tickets
    .filter((ticket) => visible.has(ticket.machineId))
    .map((ticket) =>
      toPublicTicket(ticket, auth.user, visible.get(ticket.machineId)),
    );

  return json({
    tickets: filtered,
    unreadCount: filtered.filter((ticket) => ticket.unread).length,
  });
}
