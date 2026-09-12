import { canAccessMachine } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { toPublicTicket } from "@/lib/care";
import { json } from "@/lib/http";
import { getOrgContext, listMachines, listTickets } from "@/lib/store";

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) {
    return auth.error;
  }

  const [tickets, machines, org] = await Promise.all([
    listTickets(),
    listMachines(),
    getOrgContext(),
  ]);
  const visible = new Map(
    machines
      .filter((machine) =>
        canAccessMachine(auth.user, machine, org.sites, org.customers),
      )
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
