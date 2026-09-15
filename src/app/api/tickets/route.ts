import { canAccessMachine } from "@/lib/access";
import { requireTenantUser } from "@/lib/auth/tenant-scope";
import { toPublicTicket } from "@/lib/care";
import { json } from "@/lib/http";
import { getOrgContext, listMachines, listTickets } from "@/lib/store";

export async function GET() {
  const auth = await requireTenantUser();
  if ("error" in auth) {
    return auth.error;
  }

  const [tickets, machines, org] = await Promise.all([
    listTickets(auth.tenantId),
    listMachines(auth.tenantId),
    getOrgContext(auth.tenantId),
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
