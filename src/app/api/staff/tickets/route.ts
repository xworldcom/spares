import { requireTenantStaff } from "@/lib/auth/tenant-scope";
import { toPublicTicket } from "@/lib/care";
import { json } from "@/lib/http";
import { listMachines, listTickets } from "@/lib/store";

export async function GET() {
  const auth = await requireTenantStaff();
  if ("error" in auth) {
    return auth.error;
  }

  const [tickets, machines] = await Promise.all([
    listTickets(auth.tenantId),
    listMachines(auth.tenantId),
  ]);
  const names = new Map(machines.map((machine) => [machine.id, machine.name]));
  const publicTickets = tickets.map((ticket) =>
    toPublicTicket(ticket, auth.user, names.get(ticket.machineId)),
  );
  return json({
    tickets: publicTickets,
    unreadCount: publicTickets.filter((ticket) => ticket.unread).length,
  });
}
